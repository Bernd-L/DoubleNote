import {
  Component,
  Input,
  ElementRef,
  AfterViewInit,
  ViewChild,
} from "@angular/core";

import { fromEvent, merge } from "rxjs";
import { switchMap, takeUntil, pairwise } from "rxjs/operators";

/*
  Some parts taken from
  https://medium.com/@tarik.nzl/creating-a-canvas-component-with-free-hand-drawing-with-rxjs-and-angular-61279f577415
*/

@Component({
  selector: "app-draw",
  templateUrl: "./draw.component.html",
  styleUrls: ["./draw.component.scss"],
})
export class DrawComponent implements AfterViewInit {
  // a reference to the canvas element from our template
  @ViewChild("canvas") public canvas!: ElementRef;

  // setting a width and height for the canvas
  @Input() public width = 400;
  @Input() public height = 400;

  private cx!: CanvasRenderingContext2D;

  public ngAfterViewInit() {
    // get the context
    const canvasEl: HTMLCanvasElement = this.canvas.nativeElement;
    this.cx = canvasEl.getContext("2d")!;

    // set the width and height
    canvasEl.width = this.width;
    canvasEl.height = this.height;

    // set some default properties about the line
    this.cx.lineWidth = 3;
    this.cx.lineCap = "round";
    this.cx.strokeStyle = "#000";

    // we'll implement this method to start capturing mouse events
    this.captureEvents(canvasEl);
  }

  private captureEvents(canvasEl: HTMLCanvasElement) {
    // this will capture all mousedown events from the canvas element
    merge(fromEvent(canvasEl, "mousedown"), fromEvent(canvasEl, "touchstart"))
      .pipe(
        switchMap((e) => {
          // after a mouse down, we'll record all mouse moves
          return merge(
            fromEvent(canvasEl, "mousemove"),
            fromEvent(canvasEl, "touchmove")
          ).pipe(
            // we'll stop (and unsubscribe) once the user releases the mouse
            // this will trigger a 'mouseup' event
            takeUntil(
              merge(
                fromEvent(canvasEl, "mouseup"),
                fromEvent(canvasEl, "touched")
              )
            ),
            // we'll also stop (and unsubscribe) once the mouse leaves the canvas (mouseleave event)
            takeUntil(
              merge(
                fromEvent(canvasEl, "mouseleave"),
                fromEvent(canvasEl, "touchcancel")
              )
            ),
            // pairwise lets us get the previous value to draw a line from
            // the previous point to the current point
            pairwise()
          );
        })
      )
      .subscribe((result) =>
        ((res: [MouseEvent, MouseEvent] | [TouchEvent, TouchEvent]) => {
          const rect = canvasEl.getBoundingClientRect();

          // previous and current position with the offset
          const prevPos =
            res[0] instanceof MouseEvent
              ? {
                  x: res[0].clientX - rect.left,
                  y: res[0].clientY - rect.top,
                }
              : {
                  x: res[0].touches[0].clientX - rect.left,
                  y: res[0].touches[0].clientY - rect.top,
                };

          const currentPos =
            res[1] instanceof MouseEvent
              ? {
                  x: res[1].clientX - rect.left,
                  y: res[1].clientY - rect.top,
                }
              : {
                  x: res[1].touches[0].clientX - rect.left,
                  y: res[1].touches[0].clientY - rect.top,
                };

          // this method we'll implement soon to do the actual drawing
          this.drawOnCanvas(prevPos, currentPos);
        })(result as [MouseEvent, MouseEvent] | [TouchEvent, TouchEvent])
      );
  }

  private drawOnCanvas(
    prevPos: { x: number; y: number },
    currentPos: { x: number; y: number }
  ) {
    // incase the context is not set
    if (!this.cx) {
      return;
    }

    // start our drawing path
    this.cx.beginPath();

    // we're drawing lines so we need a previous position
    if (prevPos) {
      // sets the start point
      this.cx.moveTo(prevPos.x, prevPos.y); // from

      // draws a line from the start pos until the current position
      this.cx.lineTo(currentPos.x, currentPos.y);

      // strokes the current path with the styles we set earlier
      this.cx.stroke();
    }
  }
}
