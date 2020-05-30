import { LayoutModule } from "@angular/cdk/layout";
import { NgModule } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { ServiceWorkerModule } from "@angular/service-worker";
import { environment } from "../environments/environment";

import { AppComponent } from "./app.component";
import { UserInterfaceModule } from "./user-interface/user-interface.module";

// Do not remove the unused imports!
// The app does not compile without them for some reason
import { BoxCanvasPageModule } from "./box-canvas-page/box-canvas-page.module";
// import { DrawComponent } from "./box-canvas-page/components/draw/draw.component";
// import { TextBoxComponent } from "./box-canvas-page/components/text-box/text-box.component";
import { CoreModule } from "./core/core.module";
import { AppRoutingModule } from "./routes/app-routing.module";

@NgModule({
  declarations: [AppComponent],
  imports: [
    UserInterfaceModule,

    // HttpClientModule,
    BrowserAnimationsModule,
    LayoutModule,

    BrowserModule,
    // AppRoutingModule,
    ServiceWorkerModule.register("ngsw-worker.js", {
      enabled: environment.production,
    }),
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
