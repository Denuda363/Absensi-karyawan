import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

export interface ExportManualPdfOptions {
  container: HTMLElement;
  fileName: string;
  onProgress?: (current: number, total: number) => void;
}

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

export async function exportManualToPdf({
  container,
  fileName,
  onProgress,
}: ExportManualPdfOptions): Promise<void> {
  const sheets = Array.from(
    container.querySelectorAll<HTMLElement>('[data-book-page]')
  );

  if (sheets.length === 0) {
    throw new Error('Halaman buku panduan tidak ditemukan untuk diekspor.');
  }

  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore font readiness errors
    }
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const pageId = sheet.getAttribute('data-book-page') || `page-${i + 1}`;
    const isCover = sheet.classList.contains('book-cover');

    onProgress?.(i + 1, sheets.length);

    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: isCover ? '#080F1F' : '#FFFFFF',
      windowWidth: 1280,
      onclone: (_clonedDoc, clonedEl) => {
        if (!(clonedEl instanceof HTMLElement)) return;
        clonedEl.style.width = `${A4_WIDTH_PX}px`;
        clonedEl.style.maxWidth = `${A4_WIDTH_PX}px`;
        clonedEl.style.minWidth = `${A4_WIDTH_PX}px`;
        clonedEl.style.margin = '0';
        clonedEl.style.border = 'none';
        clonedEl.style.borderRadius = '0';
        clonedEl.style.boxShadow = 'none';
        clonedEl.style.boxSizing = 'border-box';

        if (isCover) {
          clonedEl.style.height = `${A4_HEIGHT_PX}px`;
          clonedEl.style.minHeight = `${A4_HEIGHT_PX}px`;
          clonedEl.style.maxHeight = `${A4_HEIGHT_PX}px`;
          clonedEl.style.padding = '52px';
          clonedEl.style.overflow = 'hidden';
          clonedEl.style.backgroundColor = '#080F1F';
        } else {
          clonedEl.style.minHeight = `${A4_HEIGHT_PX}px`;
          clonedEl.style.padding = '52px 54px 48px 66px';
          clonedEl.style.backgroundColor = '#FFFFFF';
        }

        clonedEl.setAttribute('data-export-rendered', pageId);
      },
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.94);

    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }

    if (isCover) {
      // Full-bleed cover across the entire A4 sheet (0mm margin)
      pdf.addImage(
        imgData,
        'JPEG',
        0,
        0,
        A4_WIDTH_MM,
        A4_HEIGHT_MM,
        undefined,
        'FAST'
      );
    } else {
      const renderedHeightMm = (canvas.height * A4_WIDTH_MM) / canvas.width;
      if (renderedHeightMm <= A4_HEIGHT_MM + 1) {
        pdf.addImage(
          imgData,
          'JPEG',
          0,
          0,
          A4_WIDTH_MM,
          Math.min(A4_HEIGHT_MM, renderedHeightMm),
          undefined,
          'FAST'
        );
      } else {
        const fitRatio = A4_HEIGHT_MM / renderedHeightMm;
        const fitWidth = A4_WIDTH_MM * fitRatio;
        const offsetX = (A4_WIDTH_MM - fitWidth) / 2;
        pdf.addImage(
          imgData,
          'JPEG',
          offsetX,
          0,
          fitWidth,
          A4_HEIGHT_MM,
          undefined,
          'FAST'
        );
      }
    }

    // Yield briefly to keep UI progress responsive
    await new Promise((resolve) => setTimeout(resolve, 16));
  }

  pdf.save(fileName);
}
