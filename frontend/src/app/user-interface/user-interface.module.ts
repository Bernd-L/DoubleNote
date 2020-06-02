import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { AngularMaterialModule } from "../angular-material/angular-material.module";
import { BoxCanvasPageModule } from "../box-canvas-page/box-canvas-page.module";
import { AppRoutingModule } from "../routes/app-routing.module";
import { SequentialBlockPageModule } from "../sequential-block-page/sequential-block-page.module";
import { CreateNotebookComponent } from "./components/create-notebook/create-notebook.component";
import { CrumbTrailComponent } from "./components/crumb-trail/crumb-trail.component";
import { MainComponent } from "./components/main/main.component";
import { NotebookCardComponent } from "./components/notebook-card/notebook-card.component";
import { NotebooksComponent } from "./components/notebooks/notebooks.component";
import { PageNotFoundComponent } from "./components/page-not-found/page-not-found.component";
import { SettingsComponent } from "./components/settings/settings.component";
import { SideNavComponent } from "./components/side-nav/side-nav.component";
import { WelcomeComponent } from "./components/welcome/welcome.component";

@NgModule({
  declarations: [
    MainComponent,
    WelcomeComponent,
    SettingsComponent,
    NotebooksComponent,
    CrumbTrailComponent,
    CreateNotebookComponent,
    NotebookCardComponent,
    SideNavComponent,
    PageNotFoundComponent,
  ],
  imports: [CommonModule, AppRoutingModule, AngularMaterialModule],
  exports: [MainComponent, BoxCanvasPageModule, SequentialBlockPageModule],
})
export class UserInterfaceModule {}
