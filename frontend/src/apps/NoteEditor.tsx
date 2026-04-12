import { useEffect, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { BoldIcon, ListBulletIcon, NumberedListIcon, QueueListIcon, CodeBracketIcon, QuestionMarkCircleIcon, PhotoIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { markdownToHtml, htmlToMarkdown } from './noteMarkdown'
import { withBasePath } from '../lib/basePath'

interface NoteEditorProps {
  value: string
  onChange: (value: string) => void
  notesDir: string
}

function EditorToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children
}: {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border text-slate-600 transition-colors ${active ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white/80 hover:bg-slate-50'} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      {children}
    </button>
  )
}

export default function NoteEditor({ value, onChange, notesDir }: NoteEditorProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('https://')
  const [helpOpen, setHelpOpen] = useState(false)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https'
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: '直接开始写吧。按 Enter 换段，选中文字就能排版。'
      })
    ],
    content: markdownToHtml(value),
    editorProps: {
      attributes: {
        class: 'tiptap prose prose-slate prose-lg max-w-none min-h-[420px] px-8 py-10 focus:outline-none'
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files || [])
        const imageFile = files.find((file) => file.type.startsWith('image/'))
        if (!imageFile) {
          return false
        }

        void insertLocalImageFile(imageFile)
        return true
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files || [])
        const imageFile = files.find((file) => file.type.startsWith('image/'))
        if (!imageFile) {
          return false
        }

        void insertLocalImageFile(imageFile)
        return true
      }
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(htmlToMarkdown(nextEditor.getHTML()))
    }
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    const currentMarkdown = htmlToMarkdown(editor.getHTML()).trim()
    const nextMarkdown = value.trim()
    if (currentMarkdown === nextMarkdown) {
      return
    }

    editor.commands.setContent(markdownToHtml(value), { emitUpdate: false })
  }, [editor, value])

  if (!editor) {
    return <div className="h-full animate-pulse rounded-3xl bg-slate-100" />
  }

  const openLinkDialog = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined
    setLinkValue(previousUrl || 'https://')
    setLinkDialogOpen(true)
  }

  const submitLink = () => {
    const nextUrl = linkValue.trim()
    if (!nextUrl) {
      editor.chain().focus().unsetLink().run()
      setLinkDialogOpen(false)
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: nextUrl }).run()
    setLinkDialogOpen(false)
  }

  const saveImageAsset = async (file: File) => {
    const fileBuffer = await file.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)))

    const response = await fetch(withBasePath('/api/system/notes/assets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: notesDir, fileName: file.name, data: base64 })
    })
    const json = await response.json()

    if (!json.success) {
      throw new Error(json.error || '图片保存失败')
    }

    return json.data.relativePath as string
  }

  const insertImageIntoEditor = (src: string, altText: string) => {
    editor.chain().focus().setImage({ src, alt: altText, title: altText }).run()
  }

  const insertLocalImageFile = async (file: File) => {
    const relativePath = await saveImageAsset(file)
    const altText = window.prompt('输入图片说明', file.name.replace(/\.[^.]+$/, '')) || '图片'
    insertImageIntoEditor(relativePath, altText)
  }

  const insertImageMarkdown = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'

    const file = await new Promise<File | null>((resolve) => {
      input.onchange = () => resolve(input.files?.[0] || null)
      input.click()
    })

    if (!file) {
      return
    }

    await insertLocalImageFile(file)
  }

  const insertTableMarkdown = () => {
    if (editor.isActive('table')) {
      editor.chain().focus().addRowAfter().run()
      return
    }

    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-amber-100 bg-[#fffdf8] shadow-[0_20px_60px_rgba(148,113,57,0.10)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-100/80 bg-white/80 px-6 py-3 backdrop-blur-sm">
        <EditorToolbarButton label="一级标题" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <span className="text-sm font-black">H1</span>
        </EditorToolbarButton>
        <EditorToolbarButton label="二级标题" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <span className="text-sm font-black">H2</span>
        </EditorToolbarButton>
        <EditorToolbarButton label="三级标题" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <span className="text-sm font-black">H3</span>
        </EditorToolbarButton>
        <EditorToolbarButton label="加粗" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <BoldIcon className="h-4 w-4" />
        </EditorToolbarButton>
        <EditorToolbarButton label="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <span className="text-sm italic font-semibold">I</span>
        </EditorToolbarButton>
        <EditorToolbarButton label="下划线" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <span className="text-sm underline font-semibold">U</span>
        </EditorToolbarButton>
        <EditorToolbarButton label="删除线" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <span className="text-sm line-through font-semibold">S</span>
        </EditorToolbarButton>
        <EditorToolbarButton label="行内代码" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <CodeBracketIcon className="h-4 w-4" />
        </EditorToolbarButton>
        <EditorToolbarButton label="代码块" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <span className="text-xs font-mono">```</span>
        </EditorToolbarButton>
        <EditorToolbarButton label="链接" active={editor.isActive('link')} onClick={openLinkDialog}>
          <span className="text-xs font-semibold">Link</span>
        </EditorToolbarButton>
        <EditorToolbarButton label="图片" onClick={insertImageMarkdown}>
          <PhotoIcon className="h-4 w-4" />
        </EditorToolbarButton>
        <EditorToolbarButton label="任务列表" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <CheckCircleIcon className="h-4 w-4" />
        </EditorToolbarButton>
        <EditorToolbarButton label="无序列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <ListBulletIcon className="h-4 w-4" />
        </EditorToolbarButton>
        <EditorToolbarButton label="有序列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <NumberedListIcon className="h-4 w-4" />
        </EditorToolbarButton>
        <EditorToolbarButton label="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <QueueListIcon className="h-4 w-4" />
        </EditorToolbarButton>
        <EditorToolbarButton label="分割线" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <span className="text-sm font-bold">---</span>
        </EditorToolbarButton>
        <EditorToolbarButton label="表格" onClick={insertTableMarkdown}>
          <span className="text-xs font-semibold">Table</span>
        </EditorToolbarButton>
        {editor.isActive('table') && (
          <>
            <EditorToolbarButton label="新增行" onClick={() => editor.chain().focus().addRowAfter().run()}>
              <span className="text-xs font-semibold">+R</span>
            </EditorToolbarButton>
            <EditorToolbarButton label="新增列" onClick={() => editor.chain().focus().addColumnAfter().run()}>
              <span className="text-xs font-semibold">+C</span>
            </EditorToolbarButton>
            <EditorToolbarButton label="删除表格" onClick={() => editor.chain().focus().deleteTable().run()}>
              <span className="text-xs font-semibold">Del</span>
            </EditorToolbarButton>
          </>
        )}
        <EditorToolbarButton label="Markdown 帮助" onClick={() => setHelpOpen(true)}>
          <QuestionMarkCircleIcon className="h-4 w-4" />
        </EditorToolbarButton>
      </div>
      <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top,_rgba(255,248,219,0.5),_transparent_40%)]">
        <EditorContent editor={editor} />
      </div>

      {linkDialogOpen && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="p-5">
              <h3 className="text-lg font-bold text-slate-800 mb-2">编辑链接</h3>
              <p className="text-sm text-slate-500 mb-4">留空可移除当前链接。</p>
              <input
                type="text"
                value={linkValue}
                onChange={(event) => setLinkValue(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="https://example.com"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3">
              <button onClick={() => setLinkDialogOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">取消</button>
              <button onClick={submitLink} className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors">确认</button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Markdown 帮助</h3>
              <p className="text-sm text-slate-500 mt-1">当前编辑器会把内容保存成真正的 `.md` 文件，下面这些写法和工具栏是一一对应的。</p>
            </div>
            <div className="grid grid-cols-2 gap-4 p-5 text-sm text-slate-700">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><div className="font-semibold mb-2">标题</div><code># 一级标题\n## 二级标题\n### 三级标题</code></div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><div className="font-semibold mb-2">强调</div><code>**粗体**\n*斜体*\n~~删除线~~</code></div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><div className="font-semibold mb-2">列表</div><code>- 无序项\n1. 有序项</code></div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><div className="font-semibold mb-2">引用与分割线</div><code>&gt; 引用\n--- </code></div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><div className="font-semibold mb-2">代码</div><code>`行内代码`\n```ts\nconst ok = true\n```</code></div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><div className="font-semibold mb-2">链接/图片/表格</div><code>[名称](https://...)\n![图片](https://...)\n| 列1 | 列2 |</code></div>
            </div>
            <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-4 py-3">
              <button onClick={() => setHelpOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">知道了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
