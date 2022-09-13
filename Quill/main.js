function toDelta(change) {
  const { embed, ...attributes } = change.attributes ?? {};

  const delta = embed
    ? { insert: JSON.parse(embed), attributes }
    : {
        insert: change.content || '',
        attributes: change.attributes,
      };
  return delta;
}

function toDeltaList(doc) {
  const obj = doc.getRoot();
  const deltas = [];
  for (const val of obj.content.values()) {
    deltas.push(toDelta(val));
  }
  return deltas;
}
async function main() {
  console.log('hit');

  // 01. create an instance of Quill
  const quill = new Quill('#editor', {
    modules: {
      toolbar: [],
    },
    placeholder: 'Compose an epic...',
    theme: 'snow', // or 'bubble'
  });

  // 02. create client with RPCAddr(envoy) then activate it.
  const client = new yorkie.Client('http://localhost:8080');
  await client.activate();

  // 03. create a document then attach it into the client.
  const doc = new yorkie.Document('quill');
  await client.attach(doc);

  doc.update((root) => {
    if (!root.content) {
      root.content = new yorkie.RichText();
    }
  });

  // 04. bind the document with the Quill.
  // 04-1. Quill to Document.
  quill.on('text-change', (delta, oldDelta, source) => {
    if (source === 'yorkie' || !delta.ops) {
      return;
    }
    // (2)
    let from = 0;
    let to = 0;
    for (const op of delta.ops) {
      if (op.insert !== undefined) {
        // (2)
        if (op.retain !== undefined) {
          to = from + op.retain;
        }
        if (to < from) {
          to = from;
        }
        console.log(`%c insert: ${from}-${to}: ${op.insert}`, 'color: green');
        // (4)
        doc.update((root) => {
          root.content.edit(from, to, op.insert, op.attributes);
        });
        from = to + op.insert.length;
      } else if (op.delete !== undefined) {
        //  (2)
        to = from + op.delete;
        console.log(`%c delete: ${from}-${to}: ''`, 'color: red');
        // (4)
        doc.update((root) => {
          root.content.edit(from, to, '');
        });
      } else if (op.retain !== undefined) {
        // (2)
        from = to + op.retain;
        to = from;
      }
    }
  });

  // 04-2. document to Quill(remote).
  doc.getRoot().content.text.onChanges((changes) => {
    console.log('Yorkie: ', JSON.stringify(changes));
    // (1)
    const delta = [];
    let prevTo = 0;
    for (const change of changes) {
      // (2)
      if (change.type !== 'content' || change.actor === client.getID()) {
        continue;
      }
      // (3)
      const from = change.from;
      const to = change.to;
      const retainFrom = from - prevTo;
      const retainTo = to - from;
      // (4)
      const { insert, attributes } = toDelta(change);
      console.log(`%c remote: ${from}-${to}: ${insert}`, 'color:green');
      if (retainFrom) {
        delta.push({ retain: retainFrom });
      }
      if (retainTo) {
        delta.push({ delete: retainTo });
      }
      if (insert) {
        const op = { insert };
        if (attributes) {
          op.attributes = attributes;
        }
        delta.push(op);
      }
      prevTo = to;
    }
    // (4)
    if (delta.length) {
      console.log(`%c to quill: ${JSON.stringify(delta)}`, 'color: green');
      quill.updateContents(delta, 'yorkie');
    }
  });

  // 05. synchronize text of document and Quill.
  quill.setContents(
    {
      ops: toDeltaList(doc),
    },
    'yorkie',
  );
}
main();
