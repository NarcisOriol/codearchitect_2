import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {ItemTreeProvider, Item} from './tree';

let schema: any; // Declare the schema variable at the top level
let itemTreeProvider: ItemTreeProvider; // Declare the itemTreeProvider variable at the top level
let webviewPanel: vscode.WebviewView | undefined; // To keep a reference to the webview panel

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "codearchitect" is now active!');

	const config = vscode.workspace.getConfiguration('codearchitect');
	const pathFileProfile = config.get<string>('pathFileProfile', '');
	const pathProjects = config.get<string>('pathProjects', '');

	if (pathFileProfile) {
		//Check if '.schema.json is within the file name
		if(pathFileProfile.includes('.schema.json')) {
			fs.readFile(pathFileProfile, 'utf8', async (err, data) => {
				if (err) {
					vscode.window.showErrorMessage('Error reading the JSON Schema file.');
					return;
				}

				try {
					//TO IMPLEMENT dereferencing -> https://github.com/APIDevTools/json-schema-ref-parser
					schema = JSON.parse(data); // Parse the JSON data into an object
					// Validate the schema here
					// ...
					vscode.window.showInformationMessage('JSON Schema validated successfully!');
					//Initialize the tree
					itemTreeProvider = new ItemTreeProvider(pathProjects, schema);
					vscode.window.registerTreeDataProvider('codearchitect-treeview', itemTreeProvider);
				} catch (err) {
					vscode.window.showErrorMessage('Error parsing the JSON Schema.');
				}

			});
		}
		else {
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
		itemTreeProvider.refresh();
	});

	const addItemCommand = vscode.commands.registerCommand('codearchitect.addItem', async (item) => {
		await itemTreeProvider.createChildFrom(item);
	});

	const propertiesProvider = vscode.window.registerWebviewViewProvider('codearchitect-properties', {
		resolveWebviewView: (webviewView: vscode.WebviewView) => {
				webviewPanel = webviewView; // Keep a reference to the webview panel

				// Set the webview's HTML content
				webviewView.webview.html = getWebviewContent();

				// Enable scripts in the webview
				webviewView.webview.options = {
						enableScripts: true,
				};

				// Handle messages from the webview
				webviewView.webview.onDidReceiveMessage(message => {
						handleMessage(message);
				});
			}
	});

	const editObjectCommand = vscode.commands.registerCommand('codearchitect.editObject', async (item: Item) => {
		console.log('Edit object command called');
		for(const property in item.schema.properties) {
			if(item.schema.properties[property].type === 'array') {
				//if items in the array have a reference to another schema
				if(item.schema.properties[property].items.$ref) {
					//Extract the path from the pathFileProfile
          const refPath = path.join(path.dirname(pathFileProfile), item.schema.properties[property].items.$ref);
          const refSchema = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
          item.schema.properties[property].items = refSchema;
				}
				console.log('Array');
			}
		}
		if (webviewPanel) {
				webviewPanel.webview.postMessage({ command: 'editObject', item });
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
}

//async function dereferenceSchema(pathFileProfile: string) {
//	console.log('Dereferencing the JSON Schema file...');
//	try {
//		schema = await $RefParser.dereference(pathFileProfile); // Assign the dereferenced schema to the variable
//		vscode.window.showInformationMessage('Schema dereferenced successfully!');
//		//Console.log the dereferenced schema
//		console.log(schema);
//	} catch (err) {
//		vscode.window.showErrorMessage('Error dereferencing the JSON Schema file.');
//	}
//}

export function deactivate() {}
function getWebviewContent() {
	return `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="UTF-8">
			<title>Code Architect Properties</title>
			<style>
				body {
					background-color: var(--vscode-editor-background);
					color: var(--vscode-editor-foreground);
					font-family: var(--vscode-editor-font-family);
					font-size: var(--vscode-editor-font-size);
					padding: 10px;
				}

				h2 {
					margin-bottom: 10px;
				}

				label {
					display: block;
					margin-bottom: 5px;
				}

				input[type="text"],
				input[type="checkbox"] {
					margin-bottom: 10px;
					padding: 5px;
					border: 1px solid var(--vscode-editor-foreground);
					border-radius: 3px;
					background-color: var(--vscode-editor-background);
					color: var(--vscode-editor-foreground);
					font-family: var(--vscode-editor-font-family);
					font-size: var(--vscode-editor-font-size);
				}

				input[type="checkbox"] {
					width: 15px;
					height: 15px;
				}

				.suggestions {
					border: 1px solid var(--vscode-editor-foreground);
					border-radius: 3px;
					background-color: var(--vscode-editor-background);
					max-height: 150px;
					overflow-y: auto;
					margin-bottom: 10px;
					position: absolute;
					width: calc(100% - 20px);
					box-shadow: 0 2px 6px rgba(0,0,0,0.2);
					display: none;
				}

				.suggestion-item {
					padding: 5px;
					cursor: pointer;
				}

				.suggestion-item:hover {
					background-color: var(--vscode-list-hoverBackground);
				}

				.selected-items {
					margin-top: 10px;
				}

				.selected-item {
					display: flex;
					align-items: center;
					margin-bottom: 5px;
					padding: 5px;
					border: 1px solid var(--vscode-editor-foreground);
					border-radius: 3px;
					background-color: var(--vscode-editor-background);
					color: var(--vscode-editor-foreground);
				}

				.selected-item:hover .remove-button {
					display: inline;
				}

				.selected-item span {
					flex-grow: 1;
				}

				.remove-button {
					display: none;
					background-color: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border: none;
					padding: 2px 5px;
					cursor: pointer;
					border-radius: 3px;
					margin-left: 10px;
				}
			</style>
		</head>
		<body>
			<script>
				const vscode = acquireVsCodeApi();
				let selectedValues = [];
				let enumOptions = [];

				window.addEventListener('message', event => {
					const message = event.data;

					if (message.command === 'editObject') {
						// Reset previous content
						document.body.innerHTML = '';

						// Handle the editObject command
						vscode.postMessage({ command: 'objectEdited', item: message.item });

						// Add a title with item.label
						const title = document.createElement('h2');
						title.textContent = message.item.label;
						document.body.appendChild(title);

						for (const child of message.item.children) {
							if (child.type === 'string') {
								// Create a label
								const label = document.createElement('label');
								label.textContent = child.label;
								document.body.appendChild(label);

								// Create a text input element
								const input = document.createElement('input');
								input.type = 'text';
								input.value = child.description;
								document.body.appendChild(input);

								// Add a line break
								document.body.appendChild(document.createElement('br'));
							}
							else if (child.type === 'boolean') {
								// Create a label
								const label = document.createElement('label');
								label.textContent = child.label;
								document.body.appendChild(label);

								// Create a checkbox element
								const checkbox = document.createElement('input');
								checkbox.type = 'checkbox';
								checkbox.checked = child.description;
								document.body.appendChild(checkbox);

								// Add a line break
								document.body.appendChild(document.createElement('br'));
							}
							else if (child.type === 'array' && child.schema.enum) {
								const label = document.createElement('label');
								label.textContent = child.label;
								document.body.appendChild(label);

								enumOptions = child.schema.enum;

								// Create an input for filtering
								const input = document.createElement('input');
								input.type = 'text';
								input.placeholder = 'Start typing to filter...';
								document.body.appendChild(input);

								// Create a div for showing suggestions
								const suggestionsDiv = document.createElement('div');
								suggestionsDiv.className = 'suggestions';
								document.body.appendChild(suggestionsDiv);

								function renderSuggestions(options) {
									suggestionsDiv.innerHTML = '';
									options.forEach(option => {
										const suggestionItem = document.createElement('div');
										suggestionItem.className = 'suggestion-item';
										suggestionItem.textContent = option;
										suggestionItem.onclick = () => {
											selectedValues.push(option);
											renderSelectedItems();
											input.value = '';
											suggestionsDiv.style.display = 'none';
										};
										suggestionsDiv.appendChild(suggestionItem);
									});
								}

								function updateSuggestions() {
									const query = input.value.toLowerCase();
									const filteredOptions = enumOptions.filter(option =>
										option.toLowerCase().includes(query) && !selectedValues.includes(option)
									);
									renderSuggestions(filteredOptions);
								}

								// Show suggestions on input focus
								input.addEventListener('focus', () => {
									updateSuggestions();
									suggestionsDiv.style.display = 'block';
								});

								// Update suggestions on input change
								input.addEventListener('input', () => {
									updateSuggestions();
								});

								// Hide suggestions when clicking outside
								document.addEventListener('click', (event) => {
									if (!document.body.contains(event.target) || !event.target.closest('input')) {
										suggestionsDiv.style.display = 'none';
									}
								});

								// Div for displaying selected items
								const selectedItemsDiv = document.createElement('div');
								selectedItemsDiv.className = 'selected-items';
								document.body.appendChild(selectedItemsDiv);

								function renderSelectedItems() {
									selectedItemsDiv.innerHTML = '';
									selectedValues.forEach((value, index) => {
										const itemDiv = document.createElement('div');
										itemDiv.className = 'selected-item';

										const itemLabel = document.createElement('span');
										itemLabel.textContent = value;
										itemDiv.appendChild(itemLabel);

										const removeButton = document.createElement('button');
										removeButton.textContent = 'X';
										removeButton.className = 'remove-button';
										removeButton.onclick = () => {
											selectedValues.splice(index, 1);
											renderSelectedItems();
											updateSuggestions();
										};
										itemDiv.appendChild(removeButton);

										selectedItemsDiv.appendChild(itemDiv);
									});
								}
							}
						}
					}
				});

				vscode.postMessage({ command: 'webviewReady' });
			</script>
		</body>
		</html>
	`;
}

function handleMessage(message: any) {
	//// Handle the message received from the webview
	//// You can perform actions based on the message content
	//console.log('Message received from webview:', message);
	//console.log('Message command:', message.command);
	//if (message.command === 'objectEdited') {
	//		// Handle the objectEdited command
	//		console.log('Object edited:', message.item);
	//		// Perform any necessary actions with the edited item
	//}
}