import * as vscode from 'vscode';

import { Diagram } from '../diagram/diagram';
import { localize } from '../common';
import { plantumlServer } from '../renders/plantumlServer';
import { config, RenderType } from '../config';
import { makePlantumlURL } from '../plantumlURL';
import { localServer } from '../renders/localServer';

export interface DiagramURL {
    name: string;
    urls: string[];
}

export function MakeDiagramsURL(diagrams: Diagram[], format: string, bar: vscode.StatusBarItem): DiagramURL[] {
    return diagrams.map<DiagramURL>((diagram: Diagram) => {
        return MakeDiagramURL(diagram, format, bar);
    })
}
export function MakeDiagramURL(diagram: Diagram, format: string, bar: vscode.StatusBarItem): DiagramURL {
    if (bar) {
        bar.show();
        bar.text = localize(16, null, diagram.name);
    }
    let server = config.server(diagram.parentUri);

    if(config.render(diagram.parentUri) == RenderType.LocalServer) {
        localServer.startServer(diagram);
    }

    return <DiagramURL>{
        name: diagram.name,
        urls: [...Array(diagram.pageCount).keys()].map(index => makePlantumlURL(server, diagram, format, index))
    }
}