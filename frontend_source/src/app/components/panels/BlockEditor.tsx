'use client';

import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { filterSuggestionItems } from '@blocknote/core';
import { useCreateBlockNote, SuggestionMenuController, SideMenuController, SideMenu } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { mathSchema, getSlashMenuItems } from './mathBlocks';
import { NodeDragHandleMenu } from './nodeMenu';

interface BlockEditorProps {
  initialContent: any[];
  onChange: (content: any[]) => void;
  apiUrl: string;
}

export default function BlockEditor({ initialContent, onChange, apiUrl }: BlockEditorProps) {
  const editor = useCreateBlockNote({
    schema: mathSchema,
    initialContent: initialContent.length > 0 ? initialContent : undefined,
    // Full table features: header rows/columns, merge/split cells, cell colours
    tables: { headers: true, splitCells: true, cellBackgroundColor: true, cellTextColor: true },
    uploadFile: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${apiUrl}/api/mindmap/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      return `${apiUrl}${data.url}`;
    },
  });

  return (
    <div style={{ minHeight: '100%', paddingTop: 12 }}>
      <BlockNoteView
        editor={editor}
        theme="dark"
        slashMenu={false}
        sideMenu={false}
        onChange={() => onChange(editor.document)}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterSuggestionItems(getSlashMenuItems(editor), query)}
        />
        {/* ⠿ block menu with "Show on node" for tables */}
        <SideMenuController sideMenu={(props) => <SideMenu {...props} dragHandleMenu={NodeDragHandleMenu} />} />
      </BlockNoteView>
    </div>
  );
}