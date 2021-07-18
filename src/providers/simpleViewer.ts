import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';

import { RenderTask } from '../plantuml/renders/interfaces'
import { Diagram } from '../plantuml/diagram/diagram';
import { diagramsOf, currentDiagram } from '../plantuml/diagram/tools';
import { config } from '../plantuml/config';
import { localize, extensionPath } from '../plantuml/common';
import { parseError, calculateExportPath, addFileIndex, showMessagePanel, fileToBase64 } from '../plantuml/tools';
import { exportToBuffer } from "../plantuml/exporter/exportToBuffer";
import { UI } from '../ui/ui';
import { contextManager } from '../plantuml/context';

enum previewStatus {
    default,
    error,
    processing,
}
class SimpleViewer extends vscode.Disposable {

    private _uiPreview: UI;
    private _disposables: vscode.Disposable[] = [];
    private watchDisposables: vscode.Disposable[] = [];
    private status: previewStatus;
    private previewPageStatus: string;
    private rendered: Diagram;
    private task: RenderTask;
    private taskKilling: boolean;

    private images: string[];
    private imageError: string;
    private imageUri: vscode.Uri;
    private imageData: string;
    private error: string = "";
    private zoomUpperLimit: boolean = false;
    
    private editor: vscode.TextEditor;

    constructor() {
        super(() => this.dispose());
        this.register();
    }

    dispose() {
        this._disposables && this._disposables.length && this._disposables.map(d => d.dispose());
        this.watchDisposables && this.watchDisposables.length && this.watchDisposables.map(d => d.dispose());
    }

    reset() {
        this.rendered = null;
        this.previewPageStatus = "";
        this.images = [];
        this.imageError = "";
        this.error = "";
    }

    updateWebView(): string {
        let env = {
            localize: localize,
            imageData: this.imageData,
            imageError: "",
            error: "",
            hasError: "",
            status: this.previewPageStatus,
            icon: "file:///" + path.join(extensionPath, "images", "icon.png"),
            settings: JSON.stringify({
                zoomUpperLimit: this.zoomUpperLimit,
                showSpinner: this.status === previewStatus.processing,
                showSnapIndicators: config.previewSnapIndicators,
            }),
        } as any;
        
        if(this.imageUri && this._uiPreview._panel && this._uiPreview._panel.webview) {
            env.imageUri = this._uiPreview._panel.webview.asWebviewUri(this.imageUri);
        }

        try {
            switch (this.status) {
                case previewStatus.default:
                case previewStatus.error:
                    env.imageError = this.imageError;
                    env.error = this.error.replace(/\n/g, "<br />");
                    env.hasError = env.error ? "error" : "";

                    this._uiPreview.show("simpleViewer.html", env);
                    break;
                case previewStatus.processing:
                    env.error = "";
                    env.hasError = "";
                    this._uiPreview.show("simpleViewer.html", env);
                    break;
                default:
                    break;
            }
        } catch (error) {
            return error
        }
    }
    setUIStatus(status: string) {
        this.previewPageStatus = status;
    }
    async update(processingTip: boolean) {
        if (this.taskKilling) return;
        await this.killTasks();
        // console.log("updating...");
        // do not await doUpdate, so that preview window could open before update task finish.
        this.doUpdate(processingTip).catch(e => showMessagePanel(e));
    }
    private killTasks() {
        if (!this.task) return;
        this.task.canceled = true;

        if (!this.task.processes || !this.task.processes.length)
            return Promise.resolve(true);
        this.taskKilling = true;
        return Promise.all(
            this.task.processes.map(p => this.killTask(p))
        ).then(() => {
            this.task = null;
            this.taskKilling = false;
        });
    }
    private killTask(process: child_process.ChildProcess) {
        return new Promise((resolve, reject) => {
            process.kill('SIGINT');
            process.on('exit', (code) => {
                // console.log(`killed ${process.pid} with code ${code}!`);
                resolve(true);
            });
        })
    }
    get TargetChanged(): boolean {
        let current = currentDiagram();
        if (!current) return false;
        let changed = (!this.rendered || !this.rendered.isEqual(current));
        if (changed) {
            this.rendered = current;
            this.error = "";
            this.images = [];
            this.imageError = "";
            this.previewPageStatus = "";
        }
        return changed;
    }
    private async doUpdate(processingTip: boolean) {
        let diagram = currentDiagram();
        if (!diagram) {
            this.status = previewStatus.error;
            this.error = localize(3, null);
            this.images = [];
            this.updateWebView();
            return;
        }
        let task: RenderTask = exportToBuffer(diagram, "svg");
        this.task = task;

        if (processingTip) this.processing();
        await task.promise.then(
            result => {
                if (task.canceled) return;
                this.task = null;
                this.status = previewStatus.default;

                this.error = "";
                this.imageError = "";
                
                this.imageUri = vscode.Uri.parse(path.join(contextManager.context.extensionPath, "templates", "temp.svg"));
                this.imageData = result.pop().toString("utf8");
                
                this.updateWebView();
            },
            error => {
                if (task.canceled) return;
                this.task = null;
                this.status = previewStatus.error;
                let err = parseError(error)[0];
                this.error = err.error;
                let b64 = err.out.toString('base64');
                if (!(b64 || err.error)) return;
                this.imageError = `data:image/svg+xml;base64,${b64}`
                this.updateWebView();
            }
        );
    }
    //display processing tip
    processing() {
        this.status = previewStatus.processing;
        this.updateWebView();
    }
    register() {
        let disposable: vscode.Disposable;

        //register command
        disposable = vscode.commands.registerCommand('plantuml.preview', async () => {
            try {
                this.editor = vscode.window.activeTextEditor;
                if (!this.editor) return;
                let diagrams = diagramsOf(this.editor.document);
                if (!diagrams.length) return;

                //reset in case that starting commnad in none-diagram area, 
                //or it may show last error image and may cause wrong "TargetChanged" result on cursor move.
                this.reset();
                this.TargetChanged;
                //update preview
                await this.update(true);
            } catch (error) {
                showMessagePanel(error);
            }
        });
        this._disposables.push(disposable);

        this._uiPreview = new UI(
            "plantuml.preview",
            localize(17, null),
            path.join(extensionPath, "templates"),
        );
        this._disposables.push(this._uiPreview);

        this._uiPreview.addEventListener("message", e => this.handleMessage(e));
        this._uiPreview.addEventListener("open", () => this.startWatch());
        this._uiPreview.addEventListener("close", () => { this.stopWatch(); this.killTasks(); });
    }
    
    handleMessage(e) {
        let message = e.message;

        if(message && message.searchText) {
            this.searchText(message.searchText);
        } else {
            this.setUIStatus(JSON.stringify(message));
        }
    }

    searchText(searchText: string) {
        // if (!currentDiagram()) return;

        const document = this.editor.document;
        const text = document.getText();
        const index = text.indexOf(searchText);

        const position = document.positionAt(index);
        const positionEnd = document.positionAt(index + searchText.length);

        this.editor.selection = new vscode.Selection(position, positionEnd);
        this.editor.revealRange(new vscode.Range(position, positionEnd), vscode.TextEditorRevealType.InCenter);
    }

    startWatch() {
        let disposable: vscode.Disposable;
        let disposables: vscode.Disposable[] = [];

        //register watcher
        let lastTimestamp = new Date().getTime();
        disposable = vscode.workspace.onDidChangeTextDocument(e => {
            if (!config.previewAutoUpdate) return;
            if (!e || !e.document || !e.document.uri) return;
            if (e.document.uri.scheme == "plantuml") return;
            lastTimestamp = new Date().getTime();
            setTimeout(() => {
                if (new Date().getTime() - lastTimestamp >= 400) {
                    if (!currentDiagram()) return;
                    this.update(true);
                }
            }, 500);
        });
        disposables.push(disposable);
        disposable = vscode.window.onDidChangeTextEditorSelection(e => {
            if (!config.previewAutoUpdate) return;
            lastTimestamp = new Date().getTime();
            setTimeout(() => {
                if (new Date().getTime() - lastTimestamp >= 400) {
                    if (!this.TargetChanged) return;
                    this.update(true);
                }
            }, 500);
        });
        disposables.push(disposable);

        this.watchDisposables = disposables;
    }
    stopWatch() {
        for (let d of this.watchDisposables) {
            d.dispose();
        }
        this.watchDisposables = [];
    }
}
export const simpleViewer = new SimpleViewer();