# Read in Phloem - Chrome Web Store copy

## Short description

Send web and local PDFs straight to Phloem, a calm, local-first paper reading desk.

## Full description

Read in Phloem sends the PDF you choose directly into the Phloem reading desk.
Right-click a PDF link and choose **Read link in Phloem**, or use the toolbar
button while viewing a PDF. Your existing campus or institutional browser access
carries over to the download. Local PDFs work too after enabling Chrome's standard
**Allow access to file URLs** switch for the extension, or by choosing the PDF on the
extension's local-file page.

Phloem keeps papers and reading traces on your device. The extension does not
collect analytics, browsing history, identifiers, or page content, and it does
not upload your PDFs to a developer server.

Artwork credit: Phloem icon artwork by Promma.
https://www.linkedin.com/in/itpromma/

## Privacy dashboard copy

### Single purpose

Send a PDF the user explicitly chooses - from a link, the current PDF tab, or a
local file - into the Phloem reading app at houfu72.com for reading and annotation.

### contextMenus justification

Adds “Read link in Phloem” and “Read this page’s PDF in Phloem” to Chrome’s
right-click menu. The extension runs only when the user selects one of these commands.

### activeTab justification

Reads the current tab's URL only after the user clicks the extension button, so it can
identify the PDF the user explicitly chose. It does not inspect tabs passively.

### storage justification

Temporarily stores the user-selected PDF bytes so the background worker can hand
them to the Phloem tab. The pending copy is deleted immediately after delivery.

### unlimitedStorage justification

PDFs can exceed Chrome storage’s normal quota. This permission prevents a
user-selected paper from failing while it is temporarily transferred to Phloem;
the temporary copy is deleted after delivery.

### notifications justification

Shows local, user-facing errors when the selected link is not a PDF, the download
fails, the file is too large, or local-file access must be enabled.

### Host permission justification

Required only to fetch the PDF URL the user explicitly selects from any website,
including authenticated campus or library sites, and to read a user-opened local
PDF after Chrome’s separate file-URL permission is enabled. The extension does not
inspect pages or browse passively.
