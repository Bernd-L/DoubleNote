import { Injectable } from "@angular/core";
import { sha256 } from "js-sha256";
import { v4 } from "uuid";
import { BcpNotebook } from "src/typings/bcp/BcpNotebook";
import { BoxCanvasPage } from "src/typings/bcp/BoxCanvasPage";
import { CategoryTree } from "src/typings/bcp/CategoryTree";
import { BcpCommit } from "src/typings/bcp/BcpCommit";
import { TextBox } from "src/typings/bcp/TextBox";
import { cloneDeep } from "lodash";
import { fieldHider } from "src/functions/functions";
import { log } from "src/functions/console";
import { version } from "src/functions/version";
import { BranchHead, DetachedHead } from "src/typings/core/Head";
import { BcpTag } from "src/typings/bcp/BcpTag";

// Error messages
export const WORKING_TREE_DIRTY =
  "The working tree contains uncommitted changes and the force flag was not set";
export const NO_SUCH_BRANCH = "The specified branch does not exist";
export const NO_SUCH_TAG = "The specified tag does not exist";
export const HEAD_STATE_DETACHED = "Cannot commit in detached HEAD state";
export const BRANCH_NAME_TAKEN = "Branch exists already";
export const TAG_NAME_TAKEN = "Tag exists already";
export const NO_SUCH_COMMIT = "The specified commit does not exist";
export const NO_SUCH_NOTEBOOK = "Notebook not found";

@Injectable({
  providedIn: "root",
})
export class BcpVcsService {
  public notebooks: BcpNotebook[] = [];
  private commits: { [hash: string]: BcpCommit } = {};
  private trees: { [hash: string]: CategoryTree } = {};
  private pages: { [hash: string]: BoxCanvasPage } = {};
  private boxes: { [hash: string]: TextBox } = {};
  private tags: { [hash: string]: BcpTag } = {};

  private isLocalSession = false;

  public get localSession(): boolean {
    return this.isLocalSession;
  }

  /**
   * ## Box Canvas Page version control system
   *
   * A utility class managing the state of BCP notebooks
   *
   * ### Goals
   *
   * - Create new BCP notebooks
   * - Save the state of a BCP notebook as a commit
   * - De-duplicate all data
   * - Read data from localStorage
   * - Persist data to localStorage
   */
  constructor() {
    this.loadDataFromLocalStorage();
  }

  /**
   * Loads all BCP notebooks from localStorage, enables writing to localStorage
   * and prepares the notebooks for usage
   */
  public loadDataFromLocalStorage(): void {
    this.isLocalSession = true;

    this.notebooks = JSON.parse(
      window.localStorage.getItem("dn.bcp.notebooks") ?? "[]"
    );

    this.commits = JSON.parse(
      window.localStorage.getItem("dn.bcp.commits") ?? "{}"
    );

    this.trees = JSON.parse(
      window.localStorage.getItem("dn.bcp.trees") ?? "{}"
    );

    this.pages = JSON.parse(
      window.localStorage.getItem("dn.bcp.pages") ?? "{}"
    );

    this.boxes = JSON.parse(
      window.localStorage.getItem("dn.bcp.boxes") ?? "{}"
    );

    this.tags = JSON.parse(window.localStorage.getItem("dn.bcp.tags") ?? "{}");

    this.notebooks.forEach((n) => this.prepareNotebook(n));
  }

  /**
   * Loads custom data into version control, disables writing to localStorage
   * and prepares the notebooks for usage
   *
   * @param notebooks The notebooks to be loaded
   * @param commits The commits to be loaded
   * @param trees The trees to be loaded
   * @param pages The pages to be loaded
   * @param boxes The boxes to be loaded
   * @param tags The tags to be loaded
   */
  public loadExternalData(
    notebooks: BcpNotebook[],
    commits: { [hash: string]: BcpCommit },
    trees: { [hash: string]: CategoryTree },
    pages: { [hash: string]: BoxCanvasPage },
    boxes: { [hash: string]: TextBox },
    tags: { [hash: string]: BcpTag }
  ): void {
    this.isLocalSession = false;

    this.notebooks = notebooks ?? [];
    this.commits = commits ?? {};
    this.trees = trees ?? {};
    this.pages = pages ?? {};
    this.boxes = boxes ?? {};
    this.tags = tags ?? {};

    this.notebooks.forEach((n) => this.prepareNotebook(n));
  }

  /**
   * Unloads all data and disables writing to local storage
   */
  public unloadData() {
    this.isLocalSession = false;

    this.notebooks = [];
    this.commits = {};
    this.trees = {};
    this.pages = {};
    this.boxes = {};
    this.tags = {};
  }

  /**
   * Creates a commit of the specified BCP notebook on its HEAD branch
   * copying its object-representation working tree into the commit to be
   * used as its root tree.
   *
   * This method will persist the working tree before
   * committing unless the opposite is specified.
   *
   * @param notebook The notebook to be committed
   * @param persistWorkingTree If persistWorkingTree should be called
   * @param allowDetached If committing should be allowed in a detached HEAD state
   */
  commitNotebook(
    notebook: BcpNotebook,
    persistWorkingTree = true,
    allowDetached = false
  ): void {
    // Null check
    if (notebook.objects == null) {
      throw new Error("notebook.objects is nullish");
    }

    // Persist the working tree if requested
    if (persistWorkingTree) {
      this.persistWorkingTree(notebook);
    }

    // Check if the notebook is in a detached HEAD state
    if (!allowDetached && notebook.objects.head.detached) {
      throw new Error(HEAD_STATE_DETACHED);
    }

    /**
     * The commit object created by this method
     */
    const commit: BcpCommit = {
      timestamp: new Date().toISOString(),
      strings: {
        previous: this.resolveHead(notebook.strings.head, notebook),
        rootCategory: notebook.strings.workingTree,
      },
      objects: {
        previous: notebook.objects.head.commit,
        rootCategory: cloneDeep(notebook.objects.workingTree),
      },
    };

    /**
     * The hash of the commit
     */
    const commitHash = sha256(JSON.stringify(commit, fieldHider));

    // Save the commit
    this.commits[commitHash] = commit;

    // Move the head to the new commit
    notebook.objects.head.commit = commit;

    // Update the active branch if the HEAD is not detached
    switch (notebook.objects.head.detached) {
      // This switch statement cannot be replaced with an if statement; see:
      // https://github.com/microsoft/TypeScript/issues/10564#issuecomment-663879330
      case false:
        notebook.strings.branches[notebook.objects.head.name] = commitHash;
        notebook.objects.branches[notebook.objects.head.name] = commit;
        break;

      case true:
        notebook.strings.head = commitHash;
        break;
    }

    // Persist everything
    this.persistNotebooks();
    this.persistCommits();
  }

  /**
   * Creates a new branch with a specified name
   * for a BCP notebook, based on the specified commit.
   *
   * This process does not create a new commit. Instead, the new branch
   * will point to the specified commit hash directly.
   *
   * @param notebook The notebook for which a branch should be created
   * @param name The name of the branch to be created (may not exist already)
   * @param source The hash of the parent commit on which the branch should be based on
   * @param checkout If the new branch should be checked out
   */
  createBranch(
    notebook: BcpNotebook,
    name: string,
    source: string,
    checkout: boolean
  ): void {
    // Null check
    if (notebook.objects == null) {
      throw new Error("notebook.objects is nullish");
    }

    // Check if the branch exists already
    if (notebook.strings.branches.hasOwnProperty(name)) {
      throw new Error(BRANCH_NAME_TAKEN);
    }

    // Get the source commit
    const commit = this.commits[source];

    // Make sure the specified commit exists
    if (commit == null) {
      throw new Error(NO_SUCH_COMMIT);
    }

    // Create the new branch
    notebook.strings.branches[name] = source;
    notebook.objects.branches[name] = commit;

    // Move the HEAD to the specified branch if desired
    if (checkout) {
      notebook.strings.head = name;
      notebook.objects.head.commit = commit;
      notebook.objects.head.detached = false;
      (notebook.objects.head as BranchHead).name = name;
    }

    // Persist the new branch
    this.persistNotebooks();
  }

  /**
   * Creates a new tag with a specified name (and an optional description)
   * for a BCP notebook, based on the specified commit.
   *
   * This process does not create a new commit. Instead, the new tag
   * will point to the specified commit hash directly.
   *
   * @param notebook The notebook for which a tag should be created
   * @param name The name of the tag to be created (may not exist already)
   * @param description The description of the tag (may be an empty string)
   * @param target The hash of the commit to which the tag should point to
   * @param checkout If the new tag should be checked out (in headless mode)
   */
  createTag(
    notebook: BcpNotebook,
    name: string,
    description: string,
    target: string,
    checkout: boolean
  ): void {
    // Null check
    if (notebook.objects == null) {
      throw new Error("notebook.objects is nullish");
    }

    // Check if the tag exists already
    if (notebook.strings.tags.hasOwnProperty(name)) {
      throw new Error(TAG_NAME_TAKEN);
    }

    // Get the target commit
    const commit = this.commits[target];

    // Make sure the specified commit exists
    if (commit == null) {
      throw new Error(NO_SUCH_COMMIT);
    }

    /**
     * The tag object created by this method
     */
    const tag: BcpTag = {
      timestamp: new Date().toISOString(),
      name,
      description,
      strings: {
        target,
      },
      objects: {
        target: commit,
      },
    };

    /**
     * The hash of the tag
     */
    const tagHash = sha256(JSON.stringify(tag, fieldHider));

    // Save the tag
    this.tags[tagHash] = tag;
    notebook.objects.tags.push(tag);
    notebook.strings.tags.push(tagHash);

    // Move the HEAD to the specified tag if desired
    if (checkout) {
      notebook.strings.head = target;
      notebook.objects.head.commit = commit;
      notebook.objects.head.detached = true;
    }

    // Persist the new tag
    this.persistTags();
  }

  /**
   * Checks out a specified branch in a specified notebook
   *
   * This moves the HEAD to the specified branch.
   * The branch must exist in the notebook.
   *
   * If the working tree contains uncommitted changes,
   * the checkout will fail with an error, expect for when
   * the force flag is set, which may lead to data loss.
   *
   * @param notebook The notebook to be updated
   * @param branch The name of the branch to be checked out
   * @param force Whether to force the checkout process (may result in data loss)
   */
  checkoutBranch(notebook: BcpNotebook, branch: string, force = false): void {
    // Null check
    if (notebook.objects?.head.commit.objects?.rootCategory == null) {
      throw new Error(
        "notebook.objects?.head.commit.objects?.rootCategory is nullish"
      );
    }

    // Check if the branch exists
    if (!notebook.strings.branches.hasOwnProperty(branch)) {
      throw new Error(NO_SUCH_BRANCH);
    }

    // Prevent unwanted data loss
    if (
      !force &&
      this.commits[this.resolveHead(notebook.strings.head, notebook)].strings
        .rootCategory !== notebook.strings.workingTree
    ) {
      throw new Error(WORKING_TREE_DIRTY);
    }

    // Move the HEAD to the specified branch
    notebook.strings.head = branch;
    notebook.objects.head.commit = notebook.objects.branches[branch];
    notebook.objects.head.detached = false;
    (notebook.objects.head as BranchHead).name = branch;

    // Null check
    if (notebook.objects.head.commit.objects == null) {
      throw new Error("notebook.objects.head.commit.objects is nullish");
    }

    // Copy the working tree
    notebook.objects.workingTree = cloneDeep(
      notebook.objects.head.commit.objects.rootCategory
    );

    // Update the working tree hash
    this.persistWorkingTree(notebook);
  }

  /**
   * Checks out a specified tag in a specified notebook
   *
   * This moves the HEAD to the specified tag.
   * The tag must exist in the notebook.
   *
   * If the working tree contains uncommitted changes,
   * the checkout will fail with an error, expect for when
   * the force flag is set, which may lead to data loss.
   *
   * @param notebook The notebook to be updated
   * @param tag The tag to be checked out
   * @param force Whether to force the checkout process (may result in data loss)
   */
  checkoutTag(notebook: BcpNotebook, tag: BcpTag, force = false): void {
    // Null check
    if (notebook.objects?.head.commit.objects?.rootCategory == null) {
      throw new Error(
        "notebook.objects?.head.commit.objects?.rootCategory is nullish"
      );
    }

    // Check if the tag exists in the notebook
    if (!notebook.objects.tags.some((t) => t.name === tag.name)) {
      throw new Error(NO_SUCH_TAG);
    }

    // Prevent unwanted data loss
    if (
      !force &&
      this.commits[this.resolveHead(notebook.strings.head, notebook)].strings
        .rootCategory !== notebook.strings.workingTree
    ) {
      throw new Error(WORKING_TREE_DIRTY);
    }

    // Move the HEAD to the specified tag
    notebook.strings.head = tag.strings.target;
    notebook.objects.head.commit = tag.objects?.target!;
    notebook.objects.head.detached = true;

    // Null check
    if (notebook.objects.head.commit.objects == null) {
      throw new Error("notebook.objects.head.commit.objects is nullish");
    }

    // Copy the working tree
    notebook.objects.workingTree = cloneDeep(
      notebook.objects.head.commit.objects.rootCategory
    );

    // Update the working tree hash
    this.persistWorkingTree(notebook);
  }

  /**
   * Saves the uncommitted changes without committing them
   *
   * You must call this method before creating a commit.
   *
   * @param notebook The notebook of which to save the working tree
   */
  persistWorkingTree(notebook: BcpNotebook): void {
    // Null check
    if (notebook.objects == null) {
      throw new Error("notebook.objects is nullish");
    }

    const hash = this.saveTree(notebook.objects.workingTree);
    notebook.strings.workingTree = hash;

    // Persist everything
    // Saving the working tree does not produce a commit
    this.persistBoxes();
    this.persistPages();
    this.persistTrees();
    this.persistNotebooks();
  }

  /**
   * Creates a new notebook and commits it
   *
   * @param name The name of the notebook to be created
   */
  createNotebook(name: string): BcpNotebook {
    // Create a tree to be used as root
    const tree: CategoryTree = {
      name: "root",
      strings: {
        pages: [],
        children: [],
      },
    };

    // Calculate the hash of the tree
    const treeHash: string = sha256(JSON.stringify(tree, fieldHider));

    // Create a new commit
    const commit: BcpCommit = {
      timestamp: new Date().toISOString(),
      strings: {
        previous: "root",
        rootCategory: treeHash,
      },
    };

    // Calculate the hash of the commit
    const commitHash: string = sha256(JSON.stringify(commit, fieldHider));

    // Create a new notebook
    const notebook: BcpNotebook = {
      name,
      uuid: v4(),
      type: "BCP",
      strings: {
        branches: {
          master: commitHash,
        },
        head: "master",
        workingTree: treeHash,
        tags: [],
      },
    };

    // Insert everything into memory
    this.trees[treeHash] = tree;
    this.commits[commitHash] = commit;
    this.notebooks.push(notebook);

    // Initialize the notebook
    this.prepareNotebook(notebook);

    // Persist everything
    this.persistTrees();
    this.persistCommits();
    this.persistNotebooks();

    // Return the new notebook
    return notebook;
  }

  /**
   * Assigns a name to a specified notebook
   *
   * @param notebook The notebook to be renamed
   * @param name The new name for the notebook
   */
  renameNotebook(notebook: BcpNotebook, name: string): void {
    // Find the notebook
    const index = this.notebooks.findIndex((n) => n.uuid === notebook.uuid);

    // Check for the existence of the notebook
    if (index === -1) {
      throw new Error(NO_SUCH_NOTEBOOK);
    }

    // Update the name
    this.notebooks[index].name = name;

    // Persist the changes
    this.persistNotebooks();
  }

  /**
   * Prepares a notebook's object representation
   *
   * This method loads data from the string-representation
   * into the object-representation of the specified notebook.
   *
   * This procedure also updates the working tree of the notebook.
   *
   * @param notebook The notebook to prepare
   */
  private prepareNotebook(notebook: BcpNotebook) {
    /**
     * The resolved HEAD commit hash
     */
    const resolvedHead = this.resolveHead(notebook.strings.head, notebook);

    // Check, if the HEAD is detached
    if (notebook.strings.branches.hasOwnProperty(notebook.strings.head)) {
      // Prepare the target data structure
      notebook.objects = {
        branches: {},
        head: {
          commit: this.commits[resolvedHead],
          detached: false,
          name: notebook.strings.head,
        },
        workingTree: cloneDeep(this.trees[notebook.strings.workingTree]),
        tags: [],
      };
    } else {
      // Prepare the target data structure
      notebook.objects = {
        branches: {},
        head: {
          commit: this.commits[resolvedHead],
          detached: true,
        },
        workingTree: cloneDeep(this.trees[notebook.strings.workingTree]),
        tags: [],
      };
    }

    if (notebook.objects == null) {
      throw new Error("Notebook is nullish");
    }

    // Initialize every branch
    for (const [branchName, latestCommitHash] of Object.entries(
      notebook.strings.branches
    )) {
      // Get the last commit
      notebook.objects.branches[branchName] = this.commits[latestCommitHash];

      // Prepare the target data structure
      notebook.objects.branches[branchName].objects = {
        previous: this.commits[
          notebook.objects.branches[branchName].strings.previous
        ],
        rootCategory: this.trees[
          notebook.objects.branches[branchName].strings.rootCategory
        ],
      };

      // Load the branch tree
      this.loadTree(
        notebook.objects.branches[branchName].objects!.rootCategory
      );
    }

    // Initialize every tag
    for (const tagHash of notebook.strings.tags) {
      const tag = this.tags[tagHash];

      // Load the tags objects
      tag.objects = { target: this.commits[tag.strings.target] };

      // Initialize the target commit if needed
      if (tag.objects.target.objects == null) {
        tag.objects.target.objects = {
          previous: this.commits[tag.objects.target.strings.previous],
          rootCategory: this.trees[tag.objects.target.strings.rootCategory],
        };

        this.loadTree(tag.objects.target.objects.rootCategory);
      }

      notebook.objects.tags.push(tag);
    }

    // Prepare the deeper levels of the working tree recursively
    this.loadWorkingTree(notebook.objects.workingTree);
  }

  /**
   * Initializes a category; ie it recursively loads its data into memory
   * by creating copies of existing data in memory, thus avoiding mutations
   *
   * @param category The category to be initialized
   */
  private loadWorkingTree(category: CategoryTree): void {
    // Prepare the target data structure
    category.objects = { pages: [], children: [] };

    // Load the pages
    for (const pageHash of category.strings.pages) {
      const page = cloneDeep(this.pages[pageHash]);
      category.objects.pages.push(page);

      // Prepare the target data structure
      page.objects = { boxes: [] };

      // Initialize the page
      for (const boxHash of page.strings.boxes) {
        const box = cloneDeep(this.boxes[boxHash]);
        page.objects.boxes.push(box);
      }
    }

    // Recursively initialize all child categories
    for (const treeHash of category.strings.children) {
      // This operation is not very expensive, as the
      // object-representations in the children aren't loaded yet
      const child = cloneDeep(this.trees[treeHash]);
      category.objects.children.push(child);
      this.loadWorkingTree(child);
    }
  }

  /**
   * Initializes a category; ie it recursively loads its data into memory
   * by referencing existing data in memory, possibly leading to mutations
   *
   * @param category The category to be initialized
   */
  private loadTree(category: CategoryTree): void {
    // Prepare the target data structure
    category.objects = { pages: [], children: [] };

    // Load the pages
    for (const pageHash of category.strings.pages) {
      const page = this.pages[pageHash];
      category.objects.pages.push(page);

      // Prepare the target data structure
      page.objects = { boxes: [] };

      // Initialize the page
      for (const boxHash of page.strings.boxes) {
        const box = this.boxes[boxHash];
        page.objects.boxes.push(box);
      }
    }

    // Recursively initialize all child categories
    for (const treeHash of category.strings.children) {
      const child = this.trees[treeHash];
      category.objects.children.push(child);
      this.loadTree(child);
    }
  }

  /**
   * Persists a category recursively to memory
   *
   * @param category The category to be persisted
   * @return The hash of this category
   */
  private saveTree(category: CategoryTree): string {
    // Since this method id recursive, a shallow clone should be sufficient
    category = Object.assign({}, category);

    // Null check
    if (category.objects == null) {
      throw new Error("category.objects is nullish");
    }

    // Prepare the target data structure
    category.strings = { pages: [], children: [] };

    // Iterate over all pages of the category
    for (let page of category.objects.pages) {
      // Perform a shallow clone on the page
      page = Object.assign({}, page);

      // Null check
      if (page.objects == null) {
        throw new Error("page.objects is nullish");
      }

      // Prepare the target data structure
      page.strings = { boxes: [] };

      // Iterate over all boxes of the page
      for (let box of page.objects.boxes) {
        // Perform a shallow clone on the box
        box = Object.assign({}, box);

        const boxHash = sha256(JSON.stringify(box, fieldHider));
        this.boxes[boxHash] = box;
        page.strings.boxes.push(boxHash);
      }

      const pageHash = sha256(JSON.stringify(page, fieldHider));
      this.pages[pageHash] = page;
      category.strings.pages.push(pageHash);
    }

    for (const tree of category.objects.children) {
      // Cloning isn't required here, as this is a recursive method call
      // and this method clones the object in question as its first action anyway
      category.strings.children.push(this.saveTree(tree));
    }

    const hash = sha256(JSON.stringify(category, fieldHider));
    this.trees[hash] = category;
    return hash;
  }

  /**
   * Resolves a HEAD string to a commit hash
   *
   * Since the HEAD (in its string representation) may be a branch name or a commit hash,
   * it may need to be resolved. If no such branch exists, the string will be returned.
   *
   * This method does not check if the specified commit hash exists in storage.
   *
   * @param headString The string found in a HEAD to be resolved
   * @param notebook The containing notebook
   */
  public resolveHead(headString: string, notebook: BcpNotebook): string {
    return notebook.strings.branches.hasOwnProperty(headString)
      ? notebook.strings.branches[headString]
      : headString;
  }

  /**
   * Creates a dump of all BCP notebooks stored in localStorage
   * by exporting all notebooks, tags, comments, trees, pages and boxes
   * together with their corresponding hashes as a JSON string
   */
  public exportEverything(): string {
    return JSON.stringify(
      {
        metadata: {
          version,
          exportType: "dump",
          exportVersion: 1,
          date: new Date().toISOString(),
        },

        content: {
          notebooks: this.notebooks,
          tags: this.tags,
          commits: this.commits,
          trees: this.trees,
          pages: this.pages,
          boxes: this.boxes,
        },
      },
      fieldHider,
      2
    );
  }

  /**
   * Exports all metadata, commits, trees, pages and boxes of a notebook
   *
   * If current is true, only its current state will be exported
   * (older commits will not be included).
   *
   * @param notebook The notebook to be exported
   * @param currentOnly Whether to limit the export to the current state
   */
  public exportNotebookFlat(notebook: BcpNotebook, currentOnly = true): string {
    // Null check
    if (notebook.objects == null) {
      throw new Error("notebook.objects is nullish");
    }

    const tags: { [hash: string]: BcpTag } = {};
    const commits: { [hash: string]: BcpCommit } = {};
    const trees: { [hash: string]: CategoryTree } = {};
    const pages: { [hash: string]: BoxCanvasPage } = {};
    const boxes: { [hash: string]: TextBox } = {};

    /**
     * Includes a tree with a given hash in the export, along with
     * its desending trees and all their pages and boxes
     *
     * @param treeHash The hash of the tree to be processed
     */
    const processTree = (treeHash: string) => {
      // Avoid processing the tree if it's already included in the export
      if (trees.hasOwnProperty(treeHash)) {
        return;
      }

      // Add the tree to the export
      trees[treeHash] = this.trees[treeHash];

      // Add all pages to the export
      for (const pageHash of this.trees[treeHash].strings.pages) {
        pages[pageHash] = this.pages[pageHash];

        // Add all boxes to the export
        for (const boxHash of this.pages[pageHash].strings.boxes) {
          boxes[boxHash] = this.boxes[boxHash];
        }
      }

      // Iterate over all desending trees
      for (const desendingTreeHash of this.trees[treeHash].strings.children) {
        // Call recursively on all children
        processTree(desendingTreeHash);
      }
    };

    /**
     * Includes a commit with a given hash in the export, along with
     * its previous commits (if specified)
     *
     * @param commitHash The hash of the commit to be processed
     */
    const processCommit = (commitHash: string) => {
      // Avoid processing the commit if it's already included in the export
      if (commits.hasOwnProperty(commitHash)) {
        return;
      }

      // Add the commit to the export
      commits[commitHash] = this.commits[commitHash];

      // Process the root tree of the commit recursively
      processTree(this.commits[commitHash].strings.rootCategory);

      // If the export is not limited to the current state...
      if (
        !currentOnly &&
        // ..and this isn't the root commit...
        this.commits[commitHash].strings.previous !== "root"
      ) {
        // ...export the previous commit too
        processCommit(this.commits[commitHash].strings.previous);
      }
    };

    // Add the required tags
    notebook.strings.tags.forEach((th) => (tags[th] = this.tags[th]));

    // Add the required commits
    Object.values(notebook.strings.branches).forEach((ch) => processCommit(ch));

    // Add the working tree
    processTree(notebook.strings.workingTree);

    // Add the HEAD commit (if any)
    if (notebook.objects.head.detached) {
      processCommit(notebook.strings.head);
    }

    return JSON.stringify(
      {
        metadata: {
          version,
          exportType: "flat",
          exportVersion: 1,
          date: new Date().toISOString(),
        },

        content: {
          notebook,
          tags,
          commits,
          trees,
          pages,
          boxes,
        },
      },
      fieldHider,
      2
    );
  }

  /**
   * Persists the notebooks to localStorage
   */
  private persistNotebooks(): void {
    if (this.isLocalSession) {
      window.localStorage.setItem(
        "dn.bcp.notebooks",
        JSON.stringify(this.notebooks, fieldHider)
      );
    }
  }

  /**
   * Persists the commits to localStorage
   */
  private persistCommits(): void {
    if (this.isLocalSession) {
      window.localStorage.setItem(
        "dn.bcp.commits",
        JSON.stringify(this.commits, fieldHider)
      );
    }
  }

  /**
   * Persists the trees to localStorage
   */
  private persistTrees(): void {
    if (this.isLocalSession) {
      window.localStorage.setItem(
        "dn.bcp.trees",
        JSON.stringify(this.trees, fieldHider)
      );
    }
  }

  /**
   * Persists the pages to localStorage
   */
  private persistPages(): void {
    if (this.isLocalSession) {
      window.localStorage.setItem(
        "dn.bcp.pages",
        JSON.stringify(this.pages, fieldHider)
      );
    }
  }

  /**
   * Persists the boxes to localStorage
   */
  private persistBoxes(): void {
    if (this.isLocalSession) {
      window.localStorage.setItem(
        "dn.bcp.boxes",
        JSON.stringify(this.boxes, fieldHider)
      );
    }
  }

  /**
   * Persists the tags to localStorage
   */
  private persistTags(): void {
    if (this.isLocalSession) {
      window.localStorage.setItem(
        "dn.bcp.tags",
        JSON.stringify(this.tags, fieldHider)
      );
    }
  }
}
