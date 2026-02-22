/**
 * PDF export via LibreOffice headless (soffice --headless --convert-to pdf).
 * Gated by LIBREOFFICE_AVAILABLE=true environment variable.
 * Falls back to a descriptive error if LibreOffice is not installed.
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";

const execAsync = promisify(exec);

export class LibreOfficeNotAvailableError extends Error {
  constructor() {
    super(
      "PDF export requires LibreOffice to be installed on the server. " +
        "Set LIBREOFFICE_AVAILABLE=true and ensure 'soffice' is in PATH."
    );
    this.name = "LibreOfficeNotAvailableError";
  }
}

export class LibreOfficeConversionError extends Error {
  constructor(message: string) {
    super(`LibreOffice conversion failed: ${message}`);
    this.name = "LibreOfficeConversionError";
  }
}

/**
 * Check if LibreOffice is available (env gate + binary check).
 */
export function isLibreOfficeAvailable(): boolean {
  return process.env.LIBREOFFICE_AVAILABLE === "true";
}

/**
 * Convert a DOCX buffer to PDF using LibreOffice headless.
 *
 * @param docxBuffer - The DOCX file binary
 * @returns PDF buffer
 * @throws LibreOfficeNotAvailableError if not configured
 * @throws LibreOfficeConversionError if soffice fails
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  if (!isLibreOfficeAvailable()) {
    throw new LibreOfficeNotAvailableError();
  }

  // Create a unique temp directory
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qm-pdf-"));
  const inputPath = path.join(tmpDir, "input.docx");
  const expectedOutputPath = path.join(tmpDir, "input.pdf");

  try {
    // Write DOCX buffer to temp file
    await fs.writeFile(inputPath, docxBuffer);

    // Run LibreOffice conversion
    const { stderr } = await execAsync(
      `soffice --headless --convert-to pdf --outdir "${tmpDir}" "${inputPath}"`,
      { timeout: 60_000 }
    );

    if (stderr && stderr.toLowerCase().includes("error")) {
      throw new LibreOfficeConversionError(stderr);
    }

    // Check if output file exists
    try {
      await fs.access(expectedOutputPath);
    } catch {
      throw new LibreOfficeConversionError(
        `soffice did not produce output file. stderr: ${stderr}`
      );
    }

    // Read and return the PDF
    const pdfBuffer = await fs.readFile(expectedOutputPath);
    return pdfBuffer;
  } finally {
    // Always cleanup temp files
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors
    });
  }
}
