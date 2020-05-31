import { BaseCommit } from "../core/Commit";
import { BcpNotebook } from "./BcpNotebook";
import { CategoryTree } from "./CategoryTree";

export interface BcpCommit extends BaseCommit {
  strings: BaseCommit["strings"] & {
    /**
     * The hash of the root category of this commit
     */
    rootCategory: string;
  };

  objects?: BaseCommit["objects"] & {
    previous: BcpCommit;

    /**
     * The root category of this commit
     */
    rootCategory: CategoryTree;
  };
}
