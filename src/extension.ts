import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ItemTreeProvider, Item } from './tree';
import $RefParser from "@apidevtools/json-schema-ref-parser";

let schema: any; // Declare the schema variable at the top level
let itemTreeProvider: ItemTreeProvider; // Declare the itemTreeProvider variable at the top level
let webviewPanel: vscode.WebviewView | undefined; // To keep a reference to the webview panel
let itemTreeView: vscode.TreeView<Item> | undefined; // To keep a reference to the tree view

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "codearchitect" is now active!');

	const config = vscode.workspace.getConfiguration('codearchitect');
	const pathFileProfile = config.get<string>('pathFileProfile', '');
	const pathProjects = config.get<string>('pathProjects', '');

	if (pathFileProfile) {
		// Check if '.schema.json is within the file name
		if (pathFileProfile.includes('.schema.json')) {
			fs.readFile(pathFileProfile, 'utf8', async (err, data) => {
				if (err) {
					vscode.window.showErrorMessage('Error reading the JSON Schema file.');
					return;
				}

				try {
					await dereferenceSchema(pathFileProfile);
					vscode.window.showInformationMessage('JSON Schema validated successfully!');
					itemTreeProvider = new ItemTreeProvider(pathProjects, schema);
					itemTreeView = vscode.window.createTreeView('codearchitect-treeview', { treeDataProvider: itemTreeProvider });
				} catch (err) {
					vscode.window.showErrorMessage('Error parsing the JSON Schema.');
				}

			});
		} else {
			vscode.window.showErrorMessage('The file is not a JSON Schema file.');
		}
	}

	// Check if in the pathProjects directory there is any json file
	if (pathProjects) {
		fs.readdir(pathProjects, (err, files) => {
			if (err) {
				vscode.window.showErrorMessage('Error reading the projects directory.');
				return;
			}

			const jsonFiles = files.filter(file => file.endsWith('.json'));
			if (jsonFiles.length > 0) {
				vscode.window.showInformationMessage('JSON files found in the projects directory.');
			} else {
				vscode.window.showWarningMessage('No JSON files found in the projects directory.');
			}
		});
	}

	const helloWorldCommand = vscode.commands.registerCommand('codearchitect.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from codearchitect!');
	});

	const newProjectCommand = vscode.commands.registerCommand('codearchitect.newProject', async () => {
		// Call the createParent method from the tree.ts file
		await itemTreeProvider.createParent();
	});

	const refreshProjectsCommand = vscode.commands.registerCommand('codearchitect.refresh', () => {
		if (itemTreeProvider) {
			itemTreeProvider.refresh();
			vscode.window.showInformationMessage('Projects refreshed successfully!');
		}
	});

	const removeItemCommand = vscode.commands.registerCommand('codearchitect.removeItem', async (item) => {
		await itemTreeProvider.removeItem(item);
	});

	const addItemCommand = vscode.commands.registerCommand('codearchitect.addItem', async (item) => {
		await itemTreeProvider.createChildFrom(item);

	});

	const propertiesProvider = vscode.window.registerWebviewViewProvider('codearchitect-properties', {
		resolveWebviewView: (webviewView: vscode.WebviewView) => {
			webviewPanel = webviewView; // Keep a reference to the webview panel

			// Enable scripts in the webview
			webviewView.webview.options = {
				enableScripts: true,
				localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
			};


			// Set the webview's HTML content
			webviewView.webview.html = getWebviewContent(webviewView.webview, context.extensionUri);


			// Handle messages from the webview
			webviewView.webview.onDidReceiveMessage(message => {
				handleMessage(message);
			});
		}
	});

	const editObjectCommand = vscode.commands.registerCommand('codearchitect.editObject', async (item: Item) => {
		console.log('Edit object command called');
		// Get the item
		
		itemTreeView?.reveal(item, { select: true, focus: true , expand: true });
		//Wait for 250ms to make sure the tree view is expanded
		await new Promise(resolve => setTimeout(resolve, 250));
		const cachedItem = itemTreeProvider.getCachedItem(item.filePath, item.jsonPath);
		const itemCopy = JSON.parse(JSON.stringify(cachedItem));
		itemCopy.children = itemCopy.children.concat(itemCopy.hidden_children);
		if (webviewPanel) {
			webviewPanel.webview.postMessage({ command: 'editObject', item: itemCopy });
		} else {
			vscode.window.showErrorMessage('Properties panel is not open.');
		}
	});

	context.subscriptions.push(helloWorldCommand);
	context.subscriptions.push(newProjectCommand);
	context.subscriptions.push(refreshProjectsCommand);
	context.subscriptions.push(addItemCommand);
	context.subscriptions.push(editObjectCommand);
	context.subscriptions.push(propertiesProvider);
	context.subscriptions.push(removeItemCommand);
}

async function dereferenceSchema(pathFileProfile: string) {
	console.log('Dereferencing the JSON Schema file...');
	try {
		schema = await $RefParser.dereference(pathFileProfile); // Assign the dereferenced schema to the variable
		vscode.window.showInformationMessage('Schema dereferenced successfully!');
		//Console.log the dereferenced schema
		console.log(schema);
	} catch (err) {
		vscode.window.showErrorMessage('Error dereferencing the JSON Schema file.');
	}
}

export function deactivate() { }

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
	const filePath = path.join(extensionUri.fsPath, 'media', 'webview.html');
	const fileContent = fs.readFileSync(filePath, 'utf8');

	// Update paths for styles and scripts to be accessible by the webview
	const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'styles.css'));
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'script.js'));

	return fileContent
		.replace(/href="styles\.css"/, `href="${stylesUri}"`)
		.replace(/src="script\.js"/, `src="${scriptUri}"`);
}

function handleMessage(message: any) {
	//// Handle the message received from the webview
	//// You can perform actions based on the message content
	console.log('Message received from webview:', message);
	console.log('Message command:', message.command);
	if (message.command === 'saveObject') {
		// Handle the objectEdited command
		console.log('Object saved:', message.item);
		// Call the saveObject method from the tree.ts file
		itemTreeProvider.updateItem(message.item);
	}
}