// https://github.com/codemirror/codemirror5/pull/5619
function addChange(editor, from, to, text) {
	let adjust = editor.listSelections().findIndex(({ anchor, head }) => {
		return CodeMirror.cmpPos(anchor, head) == 0 && CodeMirror.cmpPos(anchor, from) == 0
	})
	editor.operation(() => {
		editor.replaceRange(text, from, to, 'yorkie');
		if (adjust > -1) {
			let range = editor.listSelections()[adjust]
			if (range && CodeMirror.cmpPos(range.head, CodeMirror.changeEnd({ from, to, text })) == 0) {
				let ranges = editor.listSelections().slice()
				ranges[adjust] = { anchor: from, head: from }
				editor.setSelections(ranges)
			}
		}
	})
}
async function main() {
	console.log('hit');
	const editor = CodeMirror.fromTextArea(document.getElementById('codemirror'), {
		lineNumbers: true
	});
	const client = new yorkie.Client('http://localhost:8080');
	await client.activate();

	const doc = new yorkie.Document('doc', 'doc1');
	await client.attach(doc);

	doc.update((root) => {
		if (!root.content) {
			root.content = new yorkie.Text();
		}
	});
	// (1) CodeMirror
	editor.on('beforeChange', (cm, change) => {
		// (1)
		if(change.origin === 'yorkie' || change.origin === 'setValue') {
			return;
		}
		console.log(change);
		
		// (2)
		const from = editor.indexFromPos(change.from);
		const to = editor.indexFromPos(change.to);
		
		// (3)
		const content = change.text.join('\n');
		// (4)
		doc.update((root) => {
			root.content.edit(from, to, content);
		});
	});
	// (2) Yorkie
	doc.getRoot().content.text.onChanges((changes) => {
		// console.log(changes);
		// (1)
		for (const change of changes) {
			console.log(change.type)
			// (2)
			if (change.type !== 'content' || change.actor === client.getID()) {
				continue;
			}
			// (3)
			const from = editor.posFromIndex(change.from);
			const to = editor.posFromIndex(change.to);

			// (4), (5)
			addChange(editor, from, to, change.content || '');
		}
	});
	editor.setValue(doc.getRoot().content.toString());
}
main();