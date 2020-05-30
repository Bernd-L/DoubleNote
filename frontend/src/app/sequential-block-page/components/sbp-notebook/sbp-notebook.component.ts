import { Component, OnInit } from "@angular/core";
import { SbpNotebook } from "src/typings/Notebook";
import { NotebookService } from "src/app/user-interface/services/notebook/notebook.service";
import { ActivatedRoute, Router } from "@angular/router";
import {
  CrumbTrailComponent,
  Icon,
} from "src/app/user-interface/components/crumb-trail/crumb-trail.component";

@Component({
  selector: "app-sbp-notebook",
  templateUrl: "./sbp-notebook.component.html",
  styleUrls: ["./sbp-notebook.component.scss"],
})
export class SbpNotebookComponent implements OnInit {
  notebook: SbpNotebook;

  constructor(
    private nbs: NotebookService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    const retrievedNotebook = nbs.notebooks.find(
      (notebook) => notebook.uuid === route.snapshot.params.notebookUuid
    );

    switch (retrievedNotebook.type) {
      case "BCP":
        this.router.navigateByUrl("/notebooks/bcp/" + retrievedNotebook.uuid);
        break;
      case "SBP":
        this.notebook = retrievedNotebook;
        break;
    }
  }

  ngOnInit(): void {
    CrumbTrailComponent.crumbs = [
      {
        icon: Icon.Notebook,
        title: "Notebooks",
        routerLink: "/notebooks",
      },
      {
        title: this.notebook.title + " (SBP)",
      },
    ];
  }
}
