# Telegram Android Rich Editor → React Web

A production-grade React reconstruction of Telegram Android's `org.telegram.ui.iv` rich editor, with the visual language of Telegram iOS.

## What it does

The editor follows the complete workflow:

1. Import an `.html` file
2. Edit it in a rich ProseMirror editor
3. Generate the document
4. Preview the rendered result or HTML source
5. Download the generated `.html` or copy the HTML

### Import

Use the `↑` button in the title bar to import an `.html` file.

The importer preserves supported semantic structures including:

- Headings and text marks
- Ordered and unordered lists
- Checkbox lists
- Quotes and code blocks
- Tables
- `details` / `summary`
- `tg-spoiler`
- `tg-emoji`
- `tg-time`
- `tg-math` / `tg-math-block`
- `tg-map`
- Galleries
- Figures and captions
- Buttons

Unsupported arbitrary semantic HTML gracefully degrades to plain blocks.

Replacing the current document is represented as a single undo step.

### Export

Generated HTML intentionally uses only the supported reference tags:

- `tg-spoiler`
- `tg-emoji`
- `tg-time`
- `tg-math` / `tg-math-block`
- `tg-map`
- `tg-collage`
- `tg-slideshow`
- `aside` / `cite`
- `<table bordered striped>`
- Checkbox `<li>` items
- `details` / `summary`
- Figures with captions

The editor does not export internal editor attributes.

## Quick start

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

Type checking:

```bash
npm run typecheck
```

A zero-build demo is also available as `rich-editor-demo.html`.

## iOS-style UI

The interface follows Telegram iOS styling with:

- Translucent navigation bar
- Back chevron
- Live character counter
- Undo / redo controls
- Bottom compose bar
- Attachment, emoji, `Aa`, lists, table and math actions
- Blue circular Generate button
- Formatting strip with:
  - Bold
  - Italic
  - Underline
  - Strikethrough
  - Spoiler
  - Monospace
  - Subscript
  - Superscript
  - Highlight
  - Quote
  - Link
  - Date
  - Inline math
  - Clear formatting
- Grabber sheets
- Preview sheet
- Spring-style animations

## Android → Web feature parity

| Telegram Android | React Web |
| --- | --- |
| `RichEditorListView` | ProseMirror schema |
| `RichTextStyle` | ProseMirror marks |
| Formatting panel | Formatting strip |
| Text / list menus | `Aa` / list sheets |
| `TableModel` | `tableCommands` |
| `RichMediaCell` | `media_figure` / `media_group` |
| `RichMapCell` | `map_block` |
| `RichMathCell` / `MathSpan` | KaTeX |
| `RichDetailsCell` | `details` |
| Slash commands | `SlashMenu` |
| Markdown shortcuts | Input rules |
| `RichEditorHistory` | `prosemirror-history` |
| Send / schedule / silent | Generate / Preview / Download |
| Upload pipeline | File picker / object URLs |
| AI compose | Omitted |

## Keyboard shortcuts

- `Ctrl+B` — Bold
- `Ctrl+I` — Italic
- `Ctrl+U` — Underline
- `Ctrl+Shift+X` — Strikethrough
- `Ctrl+E` — Monospace
- `Ctrl+Shift+S` — Spoiler
- `Ctrl+Shift+H` — Highlight
- `Ctrl+K` — Link
- `Ctrl+Alt+1…6` — Headings
- `Ctrl+Shift+7` — Ordered list
- `Ctrl+Shift+8` — Bullet list
- `Tab` / `Shift+Tab` — List indentation
- `Ctrl+Z` — Undo
- `Ctrl+Y` — Redo

History uses a `newGroupDelay` of `800ms` and a depth of `150`.

## Architecture

Core editor files:

- `src/editor/schema.ts`
- `src/editor/serializer.ts`
- `src/editor/importHtml.ts`
- `src/editor/commands.ts`
- `src/editor/tableCommands.ts`
- `src/editor/plugins.ts`
- `src/editor/nodeviews.ts`
- `src/editor/createEditor.ts`
- `src/editor/exportHtml.ts`
- `src/editor/bus.ts`

React UI components:

- `ivIcons.tsx`
- `icons.tsx`
- TopBar
- BottomPanel
- FormattingPanel
- Menus
- Dialogs
- PreviewSheet
- ErrorBoundary

Hooks and utilities:

- `hooks/useEditorBridge.ts`
- `lib/util.ts`

React owns the application chrome, while ProseMirror owns the document, selection and IME behavior.

`ErrorBoundary` renders a diagnostic card when an unexpected runtime error occurs.

## Deployment

The project is static and can be deployed to:

- Vercel
- Netlify
- GitHub Pages
- Cloudflare Pages
- Surge

There is no backend, database or environment configuration required.

Media uses local object URLs.

## Verification

The static audit verifies that:

- Imports resolve
- Named imports are exported
- The serializer only emits allowed tags
- No `data-*` editor attributes are exported
- Classes are limited to supported `language-*` values

Runtime verification requires Node.js.

---

# نسخه فارسی

## Telegram Android Rich Editor → React Web

این پروژه یک بازسازی کامل و Production-grade از Rich Editor اندروید تلگرام یعنی `org.telegram.ui.iv` در React است که ظاهر و تجربه کاربری آن بر اساس Telegram iOS طراحی شده است.

## قابلیت اصلی

ویرایشگر این workflow کامل را پشتیبانی می‌کند:

1. Import کردن فایل `.html`
2. ویرایش محتوا داخل ویرایشگر Rich بر پایه ProseMirror
3. Generate کردن سند
4. Preview نتیجه به صورت Rendered یا HTML Source
5. دانلود فایل `.html` یا Copy کردن HTML

### Import

با دکمه `↑` در Title Bar می‌توان یک فایل `.html` وارد کرد.

ساختارهای Semantic پشتیبانی‌شده حفظ می‌شوند، از جمله:

- Headingها و Text Markها
- لیست‌های Ordered و Unordered
- Checkbox List
- Quote و Code Block
- Table
- `details` / `summary`
- `tg-spoiler`
- `tg-emoji`
- `tg-time`
- `tg-math` / `tg-math-block`
- `tg-map`
- Gallery
- Figure و Caption
- Button

HTMLهای Semantic ناشناخته به صورت امن به Blockهای ساده تبدیل می‌شوند.

جایگزین کردن Document فعلی به عنوان یک مرحله Undo در History ثبت می‌شود.

### Export

HTML خروجی فقط از Tagهای مرجع و پشتیبانی‌شده استفاده می‌کند:

- `tg-spoiler`
- `tg-emoji`
- `tg-time`
- `tg-math` / `tg-math-block`
- `tg-map`
- `tg-collage`
- `tg-slideshow`
- `aside` / `cite`
- `<table bordered striped>`
- `<li>` برای Checkboxها
- `details` / `summary`
- Figure همراه با Caption

Attributeهای داخلی Editor در خروجی HTML قرار نمی‌گیرند.

## اجرای پروژه

ابتدا Dependencies را نصب کنید:

```bash
npm install
npm run dev
```

برای Production Build:

```bash
npm run build
npm run preview
```

برای Type Check:

```bash
npm run typecheck
```

یک نسخه Zero-build نیز با نام `rich-editor-demo.html` وجود دارد.

## رابط کاربری شبیه iOS

رابط کاربری با الهام از Telegram iOS ساخته شده و شامل موارد زیر است:

- Navigation Bar شفاف
- Back Chevron
- Character Counter زنده
- Undo / Redo
- Compose Bar پایین صفحه
- Attachment، Emoji، `Aa`، List، Table و Math
- دکمه آبی و دایره‌ای Generate
- Formatting Strip شامل:
  - Bold
  - Italic
  - Underline
  - Strikethrough
  - Spoiler
  - Monospace
  - Subscript
  - Superscript
  - Highlight
  - Quote
  - Link
  - Date
  - Inline Math
  - Clear Formatting
- Sheetهای دارای Grabber
- Preview Sheet
- انیمیشن‌های Spring-style

## تطبیق Android با Web

| Telegram Android | React Web |
| --- | --- |
| `RichEditorListView` | ProseMirror schema |
| `RichTextStyle` | ProseMirror marks |
| Formatting panel | Formatting strip |
| Text / list menus | `Aa` / list sheets |
| `TableModel` | `tableCommands` |
| `RichMediaCell` | `media_figure` / `media_group` |
| `RichMapCell` | `map_block` |
| `RichMathCell` / `MathSpan` | KaTeX |
| `RichDetailsCell` | `details` |
| Slash commands | `SlashMenu` |
| Markdown shortcuts | Input rules |
| `RichEditorHistory` | `prosemirror-history` |
| Send / schedule / silent | Generate / Preview / Download |
| Upload pipeline | File picker / object URLs |
| AI compose | حذف شده |

## میانبرهای کیبورد

- `Ctrl+B` — Bold
- `Ctrl+I` — Italic
- `Ctrl+U` — Underline
- `Ctrl+Shift+X` — Strikethrough
- `Ctrl+E` — Monospace
- `Ctrl+Shift+S` — Spoiler
- `Ctrl+Shift+H` — Highlight
- `Ctrl+K` — Link
- `Ctrl+Alt+1…6` — Headingها
- `Ctrl+Shift+7` — Ordered List
- `Ctrl+Shift+8` — Bullet List
- `Tab` / `Shift+Tab` — Indent کردن List
- `Ctrl+Z` — Undo
- `Ctrl+Y` — Redo

History با `newGroupDelay` برابر `800ms` و Depth برابر `150` تنظیم شده است.

## معماری پروژه

فایل‌های اصلی Editor:

- `src/editor/schema.ts`
- `src/editor/serializer.ts`
- `src/editor/importHtml.ts`
- `src/editor/commands.ts`
- `src/editor/tableCommands.ts`
- `src/editor/plugins.ts`
- `src/editor/nodeviews.ts`
- `src/editor/createEditor.ts`
- `src/editor/exportHtml.ts`
- `src/editor/bus.ts`

کامپوننت‌های React:

- `ivIcons.tsx`
- `icons.tsx`
- TopBar
- BottomPanel
- FormattingPanel
- Menus
- Dialogs
- PreviewSheet
- ErrorBoundary

Hookها و Utilityها:

- `hooks/useEditorBridge.ts`
- `lib/util.ts`

React مسئول Chrome و رابط کاربری برنامه است، در حالی که ProseMirror مدیریت Document، Selection و رفتار IME را بر عهده دارد.

`ErrorBoundary` در صورت رخ دادن خطای غیرمنتظره Runtime یک Diagnostic Card نمایش می‌دهد.

## Deployment

این پروژه کاملاً Static است و می‌توان آن را روی سرویس‌های زیر Deploy کرد:

- Vercel
- Netlify
- GitHub Pages
- Cloudflare Pages
- Surge

هیچ Backend، Database یا Environment Configuration لازم نیست.

Media با Local Object URL مدیریت می‌شود.

## بررسی و Verification

Static Audit موارد زیر را بررسی می‌کند:

- Importها Resolve می‌شوند
- Named Importها Export شده‌اند
- Serializer فقط Tagهای مجاز را تولید می‌کند
- هیچ Attribute از نوع `data-*` در خروجی Editor وجود ندارد
- Classها فقط به مقادیر پشتیبانی‌شده `language-*` محدود هستند

برای Runtime Verification به Node.js نیاز است.
