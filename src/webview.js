// Function to handle messages from the extension
window.addEventListener('message', event => {
    const message = event.data; // The JSON data sent from the extension

    if (message.command === 'editObject') {
        // Handle the editObject command
        console.log('Edit Object:', message.item);
        // Perform any necessary actions with the received item

        // Send a message back to the extension
        window.postMessage({ command: 'objectEdited', item: message.item }, '*');
    }
});

// Optionally, send a message to the extension once the webview is loaded
window.postMessage({ command: 'webviewLoaded' }, '*');