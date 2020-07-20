import { CdkDragEnd } from "@angular/cdk/drag-drop";
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import { exampleSetup } from "prosemirror-example-setup";
import { DOMParser, Schema } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Observable, Subscription } from "rxjs";
import { filter } from "rxjs/operators";
import { MarkdownEngineService } from "src/app/services/markdown-engine/markdown-engine.service";
import { MessageBusService } from "src/app/services/message-bus/message-bus.service";
import { environment } from "src/environments/environment";
import { log } from "src/functions/console";
import { Coordinates } from "src/typings/bcp/Coordinates";
import { TextBox } from "src/typings/bcp/TextBox";
import { Message, TextBoxMessage } from "src/typings/core/Message";

@Component({
  selector: "app-pm-box",
  templateUrl: "./pm-box.component.html",
  styleUrls: ["./pm-box.component.scss"],
})
export class PmBoxComponent implements OnInit, AfterViewInit, OnDestroy {
  // #region Fields
  /**
   * An input which represents the state of the box.
   */
  @Input()
  readonly box: TextBox;

  /**
   * The subscription to the MessageBus
   */
  private mbSub: Subscription;

  /**
   * An input to this component, notifying it when it needs to be moved
   *
   * When the application logic outside of this component decides to move this box,
   * this observable will fire an event, which does not contain the target coordinates.
   */
  @Input()
  foreignBoxMove: Observable<void>;

  /**
   * The subscription to the foreignBoxMove observable
   */
  private fbmSub: Subscription;

  /**
   * An output which fires when the state of the box has changed
   */
  @Output()
  boxStateChanged = new EventEmitter<void>();

  /**
   * This output fires when the box has been deleted
   *
   * This occurs when the user clicks the "close" button.
   */
  @Output()
  boxDeleted = new EventEmitter<void>();

  /**
   * The current position of this box relative to its Box Canvas Page
   */
  public dragPosition: Coordinates = { x: 0, y: 0 };

  /**
   * A reference to the WYSIWYG editor (ProseMirror) of this component
   */
  @ViewChild("pmEditorRef")
  pmEditorRef: ElementRef;

  // #endregion

  constructor(
    public mb: MessageBusService,
    private engine: MarkdownEngineService,
    private cdr: ChangeDetectorRef
  ) {}

  // #region Angular life cycle hooks
  ngOnInit(): void {
    // Get the message bus observable
    // Subscribe to the message bus
    this.mbSub = this.mb.messageStream

      .pipe(
        // Filter for TextBoxMessages only
        filter((m: Message) => m.messageType === "TextBoxMessage"),

        // Filter for messages about this TextBox only
        filter((m: TextBoxMessage) => m.uuid === this.box.uuid)
      )
      // Handle incoming messages
      .subscribe((message: TextBoxMessage) =>
        this.handleIncomingMessage(message)
      );

    this.cdr.detectChanges();
    this.setBoxPosition();

    this.fbmSub = this.foreignBoxMove.subscribe(() => this.setBoxPosition());

    // TODO Refresh the Markdown string
    // this.markdownText = this.engine.generateMarkdown(this.box.mdom);
  }

  ngAfterViewInit(): void {
    // setTimeout(() => {
    this.initProseMirror();
    // }, 2000);
  }

  ngOnDestroy(): void {
    this.mbSub.unsubscribe();
    this.fbmSub.unsubscribe();
  }
  // #endregion

  // #region MessageBus
  private handleIncomingMessage(message: TextBoxMessage) {
    // Log the incoming message
    log(message);

    // Update the markdown object model
    this.box.mdom = message.mdom;

    // TODO Refresh the Markdown string
    // this.markdownText = this.engine.generateMarkdown(this.box.mdom);

    // Get Angular to re-render the view
    this.cdr.detectChanges();
  }
  // #endregion

  /**
   * Initializes ProseMirror
   */
  private initProseMirror() {
    const mySchema = new Schema({
      nodes: addListNodes(
        (schema.spec.nodes as unknown) as any,
        "paragraph block*",
        "block"
      ),
      marks: schema.spec.marks,
    });

    const view = new EditorView(this.pmEditorRef.nativeElement, {
      state: EditorState.create({
        doc: DOMParser.fromSchema(mySchema).parse(
          document.querySelector("#content")
        ),
        plugins: exampleSetup({ schema: mySchema }),
      }),
    });
  }

  // #region event handlers
  /**
   * Cycles the editor(s) displayed in the text box
   */
  onCycleModes() {
    switch (this.box.state) {
      case "both":
        this.box.state = "markdown";
        break;
      case "markdown":
        this.box.state = "wysiwyg";
        break;
      case "wysiwyg":
        this.box.state = "both";
        break;
    }
  }

  onDeleteBox() {
    this.boxDeleted.emit();
  }

  onDebug() {}
  // #endregion

  // #region getters
  get stateText(): string {
    switch (this.box.state) {
      case "both":
        return "Hybrid";

      case "markdown":
        return "Markdown";

      case "wysiwyg":
        return "WYSIWYG";
    }
  }

  get isDevMode(): boolean {
    return !environment.production;
  }
  // #endregion

  // #region CDK drag-and-drop
  private setBoxPosition() {
    this.dragPosition = {
      x: this.box.x,
      y: this.box.y,
    };
  }

  public onDragEnded(event: CdkDragEnd): void {
    const position = event.source.getFreeDragPosition();

    this.box.x = position.x;
    this.box.y = position.y;

    this.setBoxPosition();
    this.boxStateChanged.emit();
  }
  // #endregion
}
