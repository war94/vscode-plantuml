import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Exporter } from './exporter';
import { Diagram } from './diagram';


export class Previewer implements vscode.TextDocumentContentProvider {

    Emittor: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();
    onDidChange: vscode.Event<vscode.Uri> = this.Emittor.event;
    Uri: vscode.Uri = vscode.Uri.parse('plantuml://preview');

    private image: string;
    private imageProcessing: string;
    private template: string;
    private templateError: string;
    private error: string = "";
    constructor(
        public config: vscode.WorkspaceConfiguration,
        public context: vscode.ExtensionContext,
        public exporter: Exporter
    ) {
        let tplPath: string = path.join(this.context.extensionPath, "templates");
        let tplPreviewPath: string = path.join(tplPath, "preview.html");
        let tplPreviewErrorPath: string = path.join(tplPath, "preview-error.html");
        this.template = '`' + fs.readFileSync(tplPreviewPath, "utf-8") + '`';
        this.templateError = '`' + fs.readFileSync(tplPreviewErrorPath, "utf-8") + '`';
        this.imageProcessing = path.join(this.context.extensionPath, "images", "preview-processing.png");
    }

    provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): string {
        let image = this.image;
        let error = this.error.replace(/\n/g, "<br />");
        if (this.error) {
            return eval(this.templateError);
        }
        return eval(this.template);
    }
    update() {
        let diagram = new Diagram().GetCurrent();
        if (!diagram.content) {
            this.error = "No valid diagram found here!";
            this.Emittor.fire(this.Uri);
            return;
        }
        this.exporter.exportToBuffer(diagram, "png").then(
            png => {
                let b64 = new Buffer(png as Buffer).toString('base64');
                this.image = `data:image/png;base64,${b64}`
                this.error = "";
                this.Emittor.fire(this.Uri);
            },
            err => {
                this.error = err.error;
                let b64 = new Buffer(err.out as Buffer).toString('base64');
                this.image = `data:image/png;base64,${b64}`
                this.Emittor.fire(this.Uri);
            }
        );
    };
    register(): vscode.Disposable[] {
        let disposable: vscode.Disposable;
        let disposables: vscode.Disposable[] = [];

        //register provider
        disposable = vscode.workspace.registerTextDocumentContentProvider('plantuml', this);
        disposables.push(disposable);

        //register command
        disposable = vscode.commands.registerCommand('plantuml.preview', () => {
            var editor = vscode.window.activeTextEditor;
            if (!editor) return;
            return vscode.commands.executeCommand('vscode.previewHtml', this.Uri, vscode.ViewColumn.Two, 'PlantUML Preview')
                .then(success => {
                    //display processing tip
                    this.error="";
                    this.image = this.imageProcessing;
                    this.Emittor.fire(this.Uri);
                    this.update();
                    return;
                }, reason => {
                    vscode.window.showErrorMessage(reason);
                });
        });
        disposables.push(disposable);

        //register watcher
        let lastTimestamp = new Date().getTime();
        disposable = vscode.workspace.onDidChangeTextDocument(e => {
            if (vscode.window.activeTextEditor.document !== e.document ||
                !this.config.get("autoUpdatePreview") as boolean) {
                return;
            }
            lastTimestamp = new Date().getTime();
            setTimeout(() => {
                if (new Date().getTime() - lastTimestamp >= 400) {
                    this.update();
                }
            }, 500);
        });
        disposables.push(disposable);

        return disposables;
    }
}