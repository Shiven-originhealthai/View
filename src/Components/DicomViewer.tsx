'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  RenderingEngine,
  Enums,
  metaData,
  init as cornerstoneCoreInit,
  type Types,
  imageLoader,
  eventTarget,
  utilities,
} from '@cornerstonejs/core';
import {
  init as cornerstoneToolsInit,
  ToolGroupManager,
  Enums as csToolsEnums,
  addTool,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  AngleTool,
  state as annotationState,
  annotation,
} from '@cornerstonejs/tools';
import { annotateDynamicAccess } from 'next/dist/server/app-render/dynamic-rendering';
import { annotationRenderingEngine } from '@cornerstonejs/tools/annotation/AnnotationRenderingEngine';
import { lineBreak } from 'html2canvas/dist/types/css/property-descriptors/line-break';

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'myViewport';
const toolGroupId = 'myToolGroup';
const annotationGroupId = 'annotationgroupid';

interface DicomViewerProps {
  dicomFile?: File | Blob;
}

export default function DicomViewer({ dicomFile }: DicomViewerProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | Blob | null>(dicomFile || null);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const viewportRef = useRef<Types.IStackViewport | null>(null);
  const [frameIndex, setFrameIndex] = useState<number>(0);
  const [totalFrames, setTotalFrames] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [bookmarklabel, setbookmark] = useState(false);
  const [bookmarkarray, setbookmarkarray] = useState<number[]>([]);
  const [toolusedonframe, settoolusedonframe] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const rangeref = useRef(null)

  const undostack: any = [];
  const redostack: any = [];

  const addLog = (message: string) => {
    console.log(message);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Initialize Cornerstone libraries once
  const multiframe = totalFrames > 1
  useEffect(() => {
    const initializeCornerstone = async () => {
      if (isInitialized) return;

      try {
        addLog('Initializing Cornerstone libraries...');
        const { init: dicomLoaderInit } = await import('@cornerstonejs/dicom-image-loader');

        await cornerstoneCoreInit();
        await dicomLoaderInit();
        await cornerstoneToolsInit();

        // Add all tools
        [PanTool, ZoomTool, WindowLevelTool, LengthTool, RectangleROITool, EllipticalROITool, AngleTool].forEach(addTool);

        setIsInitialized(true);
        addLog('Cornerstone libraries initialized successfully');
      } catch (error) {
        addLog(`Error initializing Cornerstone: ${error}`);
      }
    };

    initializeCornerstone();
  }, []);

  // Load DICOM file when file changes
  const loadDicomFile = useCallback(async (file: File | Blob) => {
    if (!isInitialized) {
      addLog('Cornerstone not initialized yet');
      return;
    }

    try {
      addLog('Loading DICOM file...');

      // Clean up previous rendering engine
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
      }

      // Clean up previous tool group
      try {
        ToolGroupManager.destroyToolGroup(toolGroupId);
      } catch (e) {
        // Tool group might not exist, ignore error
      }

      // Reset states
      setLoaded(false);
      setFrameIndex(0);
      setTotalFrames(0);
      setImageIds([]);
      setbookmarkarray([]);
      settoolusedonframe([]);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        setIsPlaying(false);
      }

      const { wadouri } = await import('@cornerstonejs/dicom-image-loader');
      const imageId = wadouri.fileManager.add(file);
      addLog(`Image ID generated: ${imageId}`);

      // Load the image to get metadata
      const image = await imageLoader.loadImage(imageId);
      addLog('Image loaded successfully');

      // Get metadata for number of frames
      const metadata = metaData.get("multiframeModule", imageId);
      const numberOfFrames = metadata?.NumberOfFrames || 1;

      addLog(`Number of frames detected: ${numberOfFrames}`);
      setTotalFrames(numberOfFrames);

      // Generate image IDs for each frame
      const generatedImageIds = [];
      if (numberOfFrames > 1) {
        for (let i = 1; i <= numberOfFrames; i++) {
          generatedImageIds.push(`${imageId}?frame=${i}`);
        }
      } else {
        generatedImageIds.push(imageId);
      }

      setImageIds(generatedImageIds);
      addLog(`Generated ${generatedImageIds.length} image IDs`);

      // Create rendering engine
      const element = elementRef.current;
      if (!element) {
        addLog('Element ref not found');
        return;
      }

      const renderingEngine = new RenderingEngine(renderingEngineId);
      renderingEngineRef.current = renderingEngine;

      renderingEngine.setViewports([
        {
          viewportId,
          type: Enums.ViewportType.STACK,
          element,
        },
      ]);

      const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
      viewportRef.current = viewport;

      await viewport.setStack(generatedImageIds);
      await viewport.setImageIdIndex(0);

      // Create tool group
      const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

      [PanTool, ZoomTool, WindowLevelTool, LengthTool, RectangleROITool, EllipticalROITool, AngleTool].forEach((Tool) => {
        toolGroup.addTool(Tool.toolName);
      });

      toolGroup.addViewport(viewportId, renderingEngineId);

      // Set default tool active
      toolGroup.setToolActive(WindowLevelTool.toolName, {
        bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
      });


      viewport.render();
      setLoaded(true);
      addLog('DICOM file loaded and rendered successfully');

    } catch (error) {
      addLog(`Error loading DICOM file: ${error}`);
    }
  }, [isInitialized]);

  // Handle file input change
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.toLowerCase().endsWith('.dcm') || file.type === 'application/dicom') {
        setCurrentFile(file);
        addLog(`Selected file: ${file.name}`);
      } else {
        addLog('Please select a valid DICOM (.dcm) file');
      }
    }
  };

  // Load file when currentFile changes
  useEffect(() => {
    if (currentFile && isInitialized) {
      loadDicomFile(currentFile);
    }
  }, [currentFile, isInitialized, loadDicomFile]);

  // Load initial file if provided
  useEffect(() => {
    if (dicomFile && isInitialized) {
      setCurrentFile(dicomFile);
    }
  }, [dicomFile, isInitialized]);

  const renderFrame = (index: number) => {
    if (!viewportRef.current || imageIds.length === 0) return;

    try {
      addLog(`Rendering frame ${index + 1}/${imageIds.length}`);
      viewportRef.current.setImageIdIndex(index);
      viewportRef.current.render();
      setFrameIndex(index);
    } catch (error) {
      addLog(`Error rendering frame: ${error}`);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const index = parseInt(e.target.value, 10);
    renderFrame(index);
  };

  const handleNext = () => {
    const nextIndex = (frameIndex + 1) % totalFrames;
    renderFrame(nextIndex);
  };

  const handlePrev = () => {
    const prevIndex = (frameIndex - 1 + totalFrames) % totalFrames;
    renderFrame(prevIndex);
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsPlaying(false);
    } else {
      const frameRate = 1000 / 10;
      intervalRef.current = setInterval(() => {
        setFrameIndex(prev => {
          const nextIndex = (prev + 1) % totalFrames;
          renderFrame(nextIndex);
          return nextIndex;
        });
      }, frameRate);
      setIsPlaying(true);
    }
  };

  const handleToolChange = (selectedToolName: string) => {
    console.log(annotation.config.style)
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) return;

    [PanTool, ZoomTool, WindowLevelTool, LengthTool, RectangleROITool, EllipticalROITool, AngleTool].forEach((Tool) => {
      if (Tool.toolName === selectedToolName) {
        toolGroup.setToolActive(Tool.toolName, {
          bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
        });
        setActiveTool(selectedToolName);
      } else {
        toolGroup.setToolPassive(Tool.toolName);
      }
    });
    settoolusedonframe(prev => prev.includes(selectedToolName) ? prev : [...prev, selectedToolName]);
    viewportRef.current?.render();
  };

  const handleannotation = (evt: any) => {
    const { annotation: ann } = evt.detail;
    if (ann.frameIndex === frameIndex && toolusedonframe.includes(ann.toolName)) {
      setbookmarkarray(prev => prev.includes(frameIndex) ? prev : [...prev, frameIndex]);
      setbookmark(true);
    }
  };

  useEffect(() => {
    eventTarget.addEventListener('annotationAdded', handleannotation);
    return () => {
      eventTarget.removeEventListener('annotationAdded', handleannotation);
    };
  }, [frameIndex, toolusedonframe]);

  const trackNewAnnotations = () => {
    const annotations = annotation.state.getAllAnnotations();
    annotations.forEach((a) => {
      undostack.push({
        uid: a.annotationUID,
        annotations: a
      });
    });
  };

  const undo = () => {
    trackNewAnnotations();
    if (undostack.length === 0) return;
    const last = undostack.pop();
    annotation.state.removeAnnotation(last.uid);
    redostack.push({
      uid: last.uid,
      ann: last.annotations
    });
    viewportRef.current?.render();
  };

  const redo = () => {
    if (redostack.length === 0) return;
    const lastRedo = redostack.pop();
    annotation.state.addAnnotation(lastRedo.ann, annotationGroupId);
    undostack.push({
      uid: lastRedo.ann.annotationUID,
      annotation: lastRedo.ann,
    });
    viewportRef.current?.render();
  };

  const clear = () => {
    annotation.state.removeAllAnnotations();
    setbookmarkarray([])
    viewportRef.current?.render();
  };

  const capture = () => {
    const element = elementRef.current;
    if (!element) return;
    const canvas = element.querySelector('.cornerstone-canvas') as HTMLCanvasElement;
    const svg = element.querySelector('.svg-layer') as SVGSVGElement;

    if (!canvas || !svg) {
      console.log('Canvas or SVG annotation layer not found');
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(canvas, 0, 0);

    const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    newSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    newSvg.setAttribute('width', String(svgRect.width));
    newSvg.setAttribute('height', String(svgRect.height));
    newSvg.setAttribute('viewBox', `0 0 ${svgRect.width} ${svgRect.height}`);

    Array.from(svg.childNodes).forEach((child) => {
      if (child.nodeType === 1) {
        newSvg.appendChild(child.cloneNode(true));
      }
    });

    const svgData = new XMLSerializer().serializeToString(newSvg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const svgImage = new window.Image();

    svgImage.onload = () => {
      const scaleX = canvas.width / canvasRect.width;
      const scaleY = canvas.height / canvasRect.height;
      const offsetX = (svgRect.left - canvasRect.left) * scaleX;
      const offsetY = (svgRect.top - canvasRect.top) * scaleY;
      const drawWidth = svgRect.width * scaleX;
      const drawHeight = svgRect.height * scaleY;
      ctx.drawImage(svgImage, offsetX, offsetY, drawWidth, drawHeight);

      const dataURL = exportCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = `dicom-capture-frame-${frameIndex + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };
    svgImage.src = url;
  };

  const bookmark = (frameNumber: number) => {
    const bookmarkedindex = frameNumber - 1;
    setbookmarkarray(prev => prev.includes(bookmarkedindex) ? prev : [...prev, bookmarkedindex]);
    setbookmark(true);
    addLog(`Bookmark added for frame ${bookmarkedindex + 1}`);
  };

  useEffect(() => {
    const ann = annotation.state.getAllAnnotations()
    ann.filter((elem) => {
      const imageid = elem.metadata.referencedImageId
      console.log(imageid)

      const frameMatch = imageid?.match(/frame=(\d+)/);
      if (frameMatch) {
        const frameNumber = parseInt(frameMatch[1])
        console.log(frameNumber)
        if (frameNumber) {
          bookmark(frameNumber)
        }

      }
    })

  }, [frameIndex])

  const getBookmarkLeft = (bookmarkedindex: number, totalFrames: number) => {
    if (bookmarkedindex == null || totalFrames <= 1) return '0px';

    // Convert 1-based frame number to 0-based slider index
    console.log(bookmarkedindex)
    const sliderIndex = bookmarkedindex;
    const percent = (sliderIndex / (totalFrames - 1));

    const pixel_value = 19 + percent * 850
    console.log('pixel value ' + pixel_value + 'for frame' + sliderIndex)

    return pixel_value - 5;
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
      }
      try {
        ToolGroupManager.destroyToolGroup(toolGroupId);
      } catch (e) {
        // Tool group might not exist, ignore error
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6">
      <h2 className="text-xl font-bold mb-4">DICOM Viewer</h2>

      {/* File Input Section */}
      <div className="mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".dcm,application/dicom"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded mb-2"
        >
          Select DICOM File
        </button>
        {currentFile && (
          <p className="text-sm text-gray-300">
            Loaded: {currentFile instanceof File ? currentFile.name : 'DICOM file'}
          </p>
        )}
      </div>

      <div className="w-full max-w-4xl flex">
        <div className="flex-1">
          {loaded && (
            <div className="flex flex-wrap justify-center gap-3 mb-4">
              {[RectangleROITool, PanTool, ZoomTool, WindowLevelTool, LengthTool, EllipticalROITool, AngleTool].map((Tool) => (
                <button
                  key={Tool.toolName}
                  onClick={() => handleToolChange(Tool.toolName)}
                  className={`px-3 py-1 rounded text-sm ${activeTool === Tool.toolName
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                >
                  {Tool.toolName}
                </button>
              ))}
            </div>
          )}

          {loaded && (
            <div className="flex flex-wrap justify-center gap-3 mb-4">
              <button className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-sm" onClick={handlePrev} disabled={!multiframe}>
                &lt; Prev
              </button>
              <button
                className='bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-sm'
                onClick={handlePlayPause} disabled={!multiframe}
              >
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <button className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-sm" onClick={handleNext} disabled={!multiframe}>
                Next &gt;
              </button>
              <button className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-sm" onClick={undo}>
                Undo
              </button>
              <button className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-sm" onClick={redo}>
                Redo
              </button>
              <button className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-sm" onClick={clear}>
                Clear
              </button>
              <button className="bg-purple-600 px-3 py-1 rounded hover:bg-purple-500 text-sm" onClick={capture}>
                Capture
              </button>
              <button className="bg-purple-600 px-3 py-1 rounded hover:bg-purple-500 text-sm" onClick={bookmark} disabled={!multiframe}>
                Bookmark
              </button>
            </div>
          )}

          <div
            ref={elementRef}
            className="border border-gray-500 bg-gray-900 mx-auto"
            style={{ width: '800px', height: '500px', touchAction: 'none' }}
          />

          {!loaded && !currentFile && (
            <div className="text-center text-gray-400 mt-4">
              Please select a DICOM file to begin
            </div>
          )}

          {currentFile && !loaded && (
            <div className="text-center text-gray-400 mt-4">
              Loading DICOM file...
            </div>
          )}

          {loaded && (
            <>
              <div className="mt-2 text-center">
                Frame: {frameIndex + 1} of {totalFrames} | Status: {isPlaying ? 'Playing' : 'Paused'}
              </div>

              <div className="relative w-full px-4 py-6">
                <input
                  type="range"
                  min="0"
                  ref={rangeref}
                  max={Math.max(totalFrames - 1, 0)}
                  value={frameIndex}
                  onChange={handleSliderChange}
                  className="w-full relative z-10 mt-2"
                />


                {/* Bookmarks */}
                <div className="absolute top-8.5 left-0 w-full h-0 z-1000 hover cursor-pointer">
                  {bookmarklabel && (
                    <div className="absolute inset-0 pointer-events-none">
                      {bookmarkarray.map((bookmarkedframe, index) => (
                        <div
                          key={index}
                          className="absolute"
                          style={{
                            left: `${getBookmarkLeft(bookmarkedframe, totalFrames)}px `,
                            top: '40%',
                            transform: 'translateY(-20%)',
                            zIndex: 20
                          }}
                        >
                          <div className="w-5 h-5 bg-yellow-400 rounded-full border-2 border-yellow-600 shadow-lg opacity-80 curaor-pointer"></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
}