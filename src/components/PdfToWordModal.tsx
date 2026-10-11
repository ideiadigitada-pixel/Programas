import React, { useState, useRef } from 'react';
import {
  FileText,
  Upload,
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  FileCode,
  RotateCcw,
  Sparkles,
  Download,
  AlertCircle,
  Plus,
} from 'lucide-react';
import {
  getPdfInfo,
  renderPdfPages,
  createNewWordDocWithPages,
  appendPagesToExistingWordDoc,
  downloadFile,
} from '../utils/pdfToWord';

interface PdfToWordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'select_pdf' | 'select_pages' | 'select_word' | 'processing' | 'success';

export const PdfToWordModal: React.FC<PdfToWordModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<Step>('select_pdf');

  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTotalPages, setPdfTotalPages] = useState<number>(0);
  const [selectedPagesMode, setSelectedPagesMode] = useState<'all' | 'custom'>('all');
  const [customPagesInput, setCustomPagesInput] = useState<string>('');
  const [selectedPageNumbers, setSelectedPageNumbers] = useState<number[]>([]);

  // Word state
  const [wordFile, setWordFile] = useState<File | null>(null);

  // Processing state
  const [progressText, setProgressText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [generatedFileName, setGeneratedFileName] = useState<string>('');

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const wordInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetAll = () => {
    setStep('select_pdf');
    setPdfFile(null);
    setPdfTotalPages(0);
    setSelectedPagesMode('all');
    setCustomPagesInput('');
    setSelectedPageNumbers([]);
    setWordFile(null);
    setProgressText('');
    setErrorMessage(null);
    setGeneratedBlob(null);
    setGeneratedFileName('');
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  // Helper to parse page range string like "1, 2, 4-6"
  const parsePageNumbers = (input: string, maxPages: number): number[] => {
    const pages = new Set<number>();
    const parts = input.split(/[,;\s]+/).filter(Boolean);

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const from = Math.max(1, Math.min(start, end));
          const to = Math.min(maxPages, Math.max(start, end));
          for (let p = from; p <= to; p++) {
            pages.add(p);
          }
        }
      } else {
        const p = parseInt(part, 10);
        if (!isNaN(p) && p >= 1 && p <= maxPages) {
          pages.add(p);
        }
      }
    }

    return Array.from(pages).sort((a, b) => a - b);
  };

  // Handle PDF file selection
  const handlePdfSelected = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMessage('Por favor, selecione um arquivo no formato PDF (.pdf).');
      return;
    }

    setErrorMessage(null);
    try {
      const info = await getPdfInfo(file);
      if (info.totalPages < 1) {
        setErrorMessage('O arquivo PDF selecionado não contém páginas válidas.');
        return;
      }
      setPdfFile(file);
      setPdfTotalPages(info.totalPages);
      // Default to all pages: 1 to totalPages
      const allPages = Array.from({ length: info.totalPages }, (_, i) => i + 1);
      setSelectedPageNumbers(allPages);
      setSelectedPagesMode('all');
      setCustomPagesInput(`1-${info.totalPages}`);
      setStep('select_pages');
    } catch (err) {
      console.error(err);
      setErrorMessage('Erro ao ler o arquivo PDF. Verifique se o arquivo não está corrompido ou protegido por senha.');
    }
  };

  // Handle Word file selection
  const handleWordSelected = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setErrorMessage('Por favor, selecione um arquivo no formato Word (.docx).');
      return;
    }
    setErrorMessage(null);
    setWordFile(file);
  };

  // Toggle page chip
  const togglePageNumber = (page: number) => {
    let next: number[];
    if (selectedPageNumbers.includes(page)) {
      next = selectedPageNumbers.filter((p) => p !== page);
    } else {
      next = [...selectedPageNumbers, page].sort((a, b) => a - b);
    }
    setSelectedPageNumbers(next);
    setSelectedPagesMode('custom');
    setCustomPagesInput(next.join(', '));
  };

  // Handle custom input change
  const handleCustomPagesChange = (text: string) => {
    setCustomPagesInput(text);
    const parsed = parsePageNumbers(text, pdfTotalPages);
    setSelectedPageNumbers(parsed);
  };

  // Start generation process
  const handleGenerate = async () => {
    if (!pdfFile || selectedPageNumbers.length === 0) return;

    setStep('processing');
    setErrorMessage(null);

    try {
      setProgressText(`Renderizando ${selectedPageNumbers.length} ${selectedPageNumbers.length === 1 ? 'página' : 'páginas'} do PDF...`);

      const renderedPages = await renderPdfPages(
        pdfFile,
        selectedPageNumbers,
        (current, total) => {
          setProgressText(`Processando página ${current} de ${total}...`);
        }
      );

      setProgressText('Criando documento Word (.docx)...');

      let resultBlob: Blob;
      let outName: string;

      if (wordFile) {
        // Append to existing Word document
        resultBlob = await appendPagesToExistingWordDoc(wordFile, renderedPages);
        const baseName = wordFile.name.replace(/\.docx$/i, '');
        outName = `${baseName}_com_paginas_pdf.docx`;
      } else {
        // Create new Word document
        resultBlob = await createNewWordDocWithPages(renderedPages);
        const baseName = pdfFile.name.replace(/\.pdf$/i, '');
        outName = `${baseName}_paginas.docx`;
      }

      setGeneratedBlob(resultBlob);
      setGeneratedFileName(outName);

      // Auto download
      downloadFile(resultBlob, outName);
      setStep('success');
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Erro ao processar o documento Word.';
      setErrorMessage(msg);
      setStep('select_word');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== 'processing') {
          handleClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-slate-200 flex flex-col animate-in fade-in zoom-in-95 duration-200 relative">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800 leading-tight">
                PDF para arquivo Word
              </h3>
              <p className="text-[11px] text-slate-500">
                {step === 'select_pdf' && 'Etapa 1 de 3: Selecionar PDF'}
                {step === 'select_pages' && 'Etapa 2 de 3: Escolher páginas'}
                {step === 'select_word' && 'Etapa 3 de 3: Arquivo Word'}
                {step === 'processing' && 'Processando páginas...'}
                {step === 'success' && 'Concluído com sucesso!'}
              </p>
            </div>
          </div>

          {step !== 'processing' && (
            <button
              type="button"
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Fechar"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Stepper indicator */}
        {step !== 'processing' && step !== 'success' && (
          <div className="flex items-center gap-1.5 pt-3 pb-1">
            <div className={`h-1 flex-1 rounded-full transition-all ${step === 'select_pdf' || step === 'select_pages' || step === 'select_word' ? 'bg-blue-600' : 'bg-slate-200'}`} />
            <div className={`h-1 flex-1 rounded-full transition-all ${step === 'select_pages' || step === 'select_word' ? 'bg-blue-600' : 'bg-slate-200'}`} />
            <div className={`h-1 flex-1 rounded-full transition-all ${step === 'select_word' ? 'bg-blue-600' : 'bg-slate-200'}`} />
          </div>
        )}

        {/* Error message if any */}
        {errorMessage && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <span className="leading-snug">{errorMessage}</span>
          </div>
        )}

        {/* ================= STEP 1: SELECT PDF ================= */}
        {step === 'select_pdf' && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-xs text-slate-600 leading-relaxed">
              Selecione o arquivo PDF que contém as páginas que você deseja inserir no Word:
            </p>

            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePdfSelected(file);
                e.target.value = '';
              }}
            />

            <div
              onClick={() => pdfInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handlePdfSelected(file);
              }}
              className="border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/40 hover:bg-blue-50/70 transition-all rounded-xl p-6 sm:p-7 flex flex-col items-center justify-center text-center cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-full bg-white shadow-xs border border-blue-200 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform mb-2.5">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-800">
                Toque para selecionar o PDF
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                ou arraste o arquivo PDF aqui (.pdf)
              </p>
            </div>
          </div>
        )}

        {/* ================= STEP 2: SELECT PAGES ================= */}
        {step === 'select_pages' && pdfFile && (
          <div className="mt-3.5 flex flex-col gap-3">
            {/* Selected PDF file summary */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-semibold text-slate-800 truncate" title={pdfFile.name}>
                  {pdfFile.name}
                </span>
              </div>
              <span className="shrink-0 font-bold text-slate-600 ml-2 bg-white px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                {pdfTotalPages} {pdfTotalPages === 1 ? 'página' : 'páginas'}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-700">
                Quais páginas deseja inserir no Word?
              </label>

              {/* Mode buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPagesMode('all');
                    const allPages = Array.from({ length: pdfTotalPages }, (_, i) => i + 1);
                    setSelectedPageNumbers(allPages);
                    setCustomPagesInput(`1-${pdfTotalPages}`);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    selectedPagesMode === 'all'
                      ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Todas ({pdfTotalPages})
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPagesMode('custom')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    selectedPagesMode === 'custom'
                      ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Páginas específicas
                </button>
              </div>

              {/* Custom input */}
              {selectedPagesMode === 'custom' && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <label htmlFor="custom-pages-input" className="text-[11px] text-slate-500 font-medium">
                    Digite os números das páginas separados por vírgula ou hífen (ex: 1, 3, 5-8):
                  </label>
                  <input
                    id="custom-pages-input"
                    type="text"
                    value={customPagesInput}
                    onChange={(e) => handleCustomPagesChange(e.target.value)}
                    placeholder={`1-${pdfTotalPages}`}
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
                  />
                </div>
              )}

              {/* Interactive page chips if pages <= 30 */}
              {pdfTotalPages <= 30 && (
                <div className="mt-1 flex flex-col gap-1">
                  <span className="text-[11px] text-slate-500 font-medium">
                    Ou clique nos números abaixo para marcar/desmarcar:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-slate-50 rounded-lg border border-slate-200">
                    {Array.from({ length: pdfTotalPages }, (_, i) => i + 1).map((num) => {
                      const isSelected = selectedPageNumbers.includes(num);
                      return (
                        <button
                          key={num}
                          type="button"
                          onClick={() => togglePageNumber(num)}
                          className={`w-7 h-7 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Total selecionado:{' '}
                <strong className="text-slate-800 font-bold">
                  {selectedPageNumbers.length} {selectedPageNumbers.length === 1 ? 'página' : 'páginas'}
                </strong>
              </p>
            </div>

            {/* Step 2 Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
              <button
                type="button"
                onClick={() => setStep('select_pdf')}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>

              <button
                type="button"
                disabled={selectedPageNumbers.length === 0}
                onClick={() => setStep('select_word')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>Avançar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: SELECT WORD (OPTIONAL) ================= */}
        {step === 'select_word' && (
          <div className="mt-3.5 flex flex-col gap-3">
            <p className="text-xs text-slate-600 leading-relaxed">
              Deseja anexar as páginas ao final de um arquivo Word existente? Se não selecionar nenhum arquivo, será criado um novo documento Word.
            </p>

            <input
              ref={wordInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleWordSelected(file);
                e.target.value = '';
              }}
            />

            {wordFile ? (
              /* Word file selected */
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <FileCode className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate" title={wordFile.name}>
                      {wordFile.name}
                    </p>
                    <p className="text-[11px] text-blue-700 font-medium">
                      As páginas serão anexadas ao final deste arquivo Word.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setWordFile(null)}
                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-white rounded transition-colors cursor-pointer shrink-0"
                  title="Remover arquivo Word e criar novo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* No Word file selected */
              <div
                onClick={() => wordInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleWordSelected(file);
                }}
                className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/60 hover:bg-blue-50/40 transition-all rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-blue-600 group-hover:scale-105 transition-all mb-2">
                  <Plus className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-700 group-hover:text-blue-700">
                  Selecionar documento Word existente (.docx)
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Opcional &bull; Clique aqui caso já tenha um arquivo Word
                </p>
              </div>
            )}

            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500">
              {wordFile ? (
                <span>
                  O arquivo original será mantido e um novo arquivo atualizado será baixado.
                </span>
              ) : (
                <span>
                  Nenhum arquivo Word selecionado: será gerado um <strong>novo documento Word (.docx)</strong> com as {selectedPageNumbers.length} {selectedPageNumbers.length === 1 ? 'página' : 'páginas'}.
                </span>
              )}
            </div>

            {/* Step 3 Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
              <button
                type="button"
                onClick={() => setStep('select_pages')}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>

              <button
                type="button"
                onClick={handleGenerate}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{wordFile ? 'Inserir no Word e Baixar' : 'Gerar Novo Documento Word'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 4: PROCESSING ================= */}
        {step === 'processing' && (
          <div className="py-8 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <RotateCcw className="w-6 h-6 animate-spin" />
            </div>
            <p className="text-sm font-bold text-slate-800">
              Gerando documento Word...
            </p>
            <p className="text-xs text-slate-500 max-w-xs">
              {progressText || 'Aguarde um instante enquanto as páginas são preparadas.'}
            </p>
          </div>
        )}

        {/* ================= STEP 5: SUCCESS ================= */}
        {step === 'success' && (
          <div className="py-5 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
              <Check className="w-7 h-7 stroke-[2.5]" />
            </div>

            <div>
              <h4 className="text-base font-bold text-slate-900">
                Word Gerado com Sucesso!
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {selectedPageNumbers.length} {selectedPageNumbers.length === 1 ? 'página inserida' : 'páginas inseridas'} no arquivo Word.
              </p>
            </div>

            <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs font-mono text-slate-700 truncate">
              {generatedFileName}
            </div>

            <div className="flex items-center gap-2 w-full mt-2">
              {generatedBlob && (
                <button
                  type="button"
                  onClick={() => downloadFile(generatedBlob, generatedFileName)}
                  className="flex-1 py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar novamente</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
