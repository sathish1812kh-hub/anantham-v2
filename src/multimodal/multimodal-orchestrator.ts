/**
 * Unified Multimodal Architecture Orchestrator
 * PRD-MM-001: Unified Multimodal Architecture
 */

import { ImageProcessor } from "./image-processor.js";
import { PerceptualHasher } from "./perceptual-hasher.js";
import { ScreenUnderstandingEngine } from "./screen-understanding.js";
import { DocumentPdfExtractor } from "./document-pdf-extractor.js";
import { MultimodalContextInjector } from "./multimodal-context-injector.js";
import { OcrPipeline } from "./ocr-pipeline.js";
import { AudioTranscriptionEngine } from "./audio-transcription-engine.js";

export class MultimodalOrchestrator {
  private imageProcessor: ImageProcessor;
  private perceptualHasher: PerceptualHasher;
  private screenEngine: ScreenUnderstandingEngine;
  private documentExtractor: DocumentPdfExtractor;
  private contextInjector: MultimodalContextInjector;
  private ocrPipeline: OcrPipeline;
  private audioEngine: AudioTranscriptionEngine;

  constructor() {
    this.imageProcessor = new ImageProcessor();
    this.perceptualHasher = new PerceptualHasher();
    this.screenEngine = new ScreenUnderstandingEngine();
    this.documentExtractor = new DocumentPdfExtractor();
    this.contextInjector = new MultimodalContextInjector();
    this.ocrPipeline = new OcrPipeline();
    this.audioEngine = new AudioTranscriptionEngine();
  }

  public getImageProcessor(): ImageProcessor {
    return this.imageProcessor;
  }

  public getPerceptualHasher(): PerceptualHasher {
    return this.perceptualHasher;
  }

  public getScreenEngine(): ScreenUnderstandingEngine {
    return this.screenEngine;
  }

  public getDocumentExtractor(): DocumentPdfExtractor {
    return this.documentExtractor;
  }

  public getContextInjector(): MultimodalContextInjector {
    return this.contextInjector;
  }

  public getOcrPipeline(): OcrPipeline {
    return this.ocrPipeline;
  }

  public getAudioEngine(): AudioTranscriptionEngine {
    return this.audioEngine;
  }
}
