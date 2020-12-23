import { Router, Request, Response } from "express";
import { V1 } from "./v1/v1";
import { version } from "../../functions/version";

export class API {
  /**
   * The main API router of the application
   */
  public router = Router();

  /**
   * The V1 API router of the application
   */
  private v1 = new V1();

  /**
   * Configures the main API router
   */
  constructor() {
    // Mount the first version of the API
    this.router.use("/v1", this.v1.router);

    // Mount the greeting endpoint
    this.router.use("/", (req, res) => this.greeting(req, res));
  }

  private greeting = (req: Request, res: Response) => {
    res.json({
      serverVersion: version,
      date: new Date().toISOString(),
      message: "Welcome to the DoubleNote API",
      apiVersions: ["/v1"],
    });
  };
}
