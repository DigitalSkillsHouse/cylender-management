Place the Arabic-capable font file here:

  NotoNaskhArabic-Regular.ttf

Download from Google Noto Fonts (Noto Naskh Arabic) and save as exactly the above filename in this folder so that PDF exports can load it via /fonts/NotoNaskhArabic-Regular.ttf.

Why needed:
- jsPDF requires embedding a Unicode font to render Arabic text correctly.
- Our export functions fetch this file and add it to the PDF Virtual File System.

After adding the file:
1) Rebuild the app (if running) so Next.js serves the new public asset.
2) Test PDF export from:
   - components/pages/employee-gas-sales.tsx
   - components/pages/employee-cylinder-sales.tsx
3) Verify Arabic text renders properly in headers and table content.
