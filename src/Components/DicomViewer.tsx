'use client';

import { useEffect, useRef, useState } from 'react';
import {
  RenderingEngine,
  Enums,
  metaData,
  init as cornerstoneCoreInit,
  type Types,
  imageLoader,
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
import { utilities } from '@cornerstonejs/tools';

// Later in your code when you need to render:


const renderingEngineId = 'myRenderingEngine';
const viewportId = 'myViewport';
const toolGroupId = 'myToolGroup';
const annotationGroupId = 'annotationgroupid'
import { getAnnotationManager } from '@cornerstonejs/tools/annotation/annotationState';
import { viewport } from '@cornerstonejs/tools/utilities';


export default function DicomViewer() {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const viewportRef = useRef<Types.IStackViewport | null>(null);
  const [frameIndex, setFrameIndex] = useState<number>(0);
  const [totalFrames, setTotalFrames] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [bookmarklabel, setbookmark] = useState(false)
  const [bookmarkarray, setbookmarkarray] = useState<number[]>([])
  let bookmarkedindex: number = 0


  const [logs, setLogs] = useState<string[]>([]);
  const undostack: any = []
  const redostack: any = []

  const addLog = (message: string) => {
    console.log(message);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const fetchDicomFile = async (): Promise<Blob> => {
    addLog('Fetching DICOM file...');
    const response = await fetch('/dicom_1.dcm');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    addLog('DICOM file fetched successfully');
    return await response.blob();
  };

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

  useEffect(() => {
    const initialize = async () => {
      addLog('Initializing Cornerstone...');
      const { init: dicomLoaderInit, wadouri } = await import('@cornerstonejs/dicom-image-loader');

      await cornerstoneCoreInit();
      await dicomLoaderInit();
      await cornerstoneToolsInit();

      const blob = await fetchDicomFile();
      const imageId = wadouri.fileManager.add(blob);
      console.log(imageId)


      const image = await imageLoader.loadImage(imageId)
      console.log(image)
      const metadata = metaData.get("multiframeModule", imageId);
      console.log("Multiframe metadata:", metadata);
      const numberOfFrames = metadata.NumberOfFrames

      addLog(`Extracted NumberOfFrames from metadata: ${numberOfFrames}`);
      setTotalFrames(numberOfFrames);

      //const generatedImageIds = Array.from({ length: numberOfFrames }, (_, i=1) => `${imageId}?frame=${i}`);
      const generatedImageIds = []
      for (let i = 1; i <= numberOfFrames - 1; i++) {
        generatedImageIds.push(`${imageId}?frame=${i}`)
      }

      setImageIds(generatedImageIds);

      const element = elementRef.current!;
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

      [PanTool, ZoomTool, WindowLevelTool, LengthTool, RectangleROITool, EllipticalROITool, AngleTool].forEach(addTool);

      const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

      [PanTool, ZoomTool, WindowLevelTool, LengthTool, RectangleROITool, EllipticalROITool, AngleTool].forEach((Tool) => {
        toolGroup.addTool(Tool.toolName);
      });

      toolGroup.addViewport(viewportId, renderingEngineId);
      setLoaded(true);
      viewport.render();
    };

    initialize();

    return () => {
      ToolGroupManager.destroyToolGroup(toolGroupId);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleToolChange = (selectedToolName: string) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) return;

    [PanTool, ZoomTool, WindowLevelTool, LengthTool, RectangleROITool, EllipticalROITool, AngleTool].forEach((Tool) => {
      if (Tool.toolName === selectedToolName) {
        toolGroup.setToolActive(Tool.toolName, {
          bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
        });
      } else {
        toolGroup.setToolPassive(Tool.toolName);
      }
    });

    viewportRef.current?.render();
  };

  function trackNewAnnotations() {
    const annotations = annotation.state.getAllAnnotations();
    annotations.forEach((a) => {
      undostack.push({
        uid: a.annotationUID,
        annotations: a
      });
    });
  }
  function undo() {
    trackNewAnnotations()
    if (undostack.length === 0) return;
    const last = undostack.pop();
    annotation.state.removeAnnotation(last.uid);
    redostack.push({
      uid: last.uid,
      ann: last.annotations
    })
    viewportRef.current?.render();
  };
  function redo() {
    if (redostack.length === 0) return;

    const lastRedo = redostack.pop();
    const { uid, annotation: annToRestore } = lastRedo;
    console.log(lastRedo)

    annotation.state.addAnnotation(lastRedo.ann, annotationGroupId);

    undostack.push({
      uid: lastRedo.ann.annotationUID,
      annotation: annToRestore,
    });

    viewportRef.current?.render();
  }

  function clear() {
    annotation.state.removeAllAnnotations()
    console.log(annotation.state.getAllAnnotations())
    viewportRef.current?.render();

  }
  const capture = () => {
    const imagId = viewportRef.current?.getCurrentImageId()
    const svglayer = elementRef.current?.querySelector('.svg-layer')
    const allannotation = annotation.state.getAllAnnotations()
    allannotation.forEach((ann) => {
      console.log(ann)
    })
    if (svglayer && svglayer.children.length > 0) {
      console.log('annotations are visually present')
    }
    else {
      console.log('annotations are not visibally present')
    }
    /*
    const element = elementRef.current;
    const canvas = element.querySelector('.cornerstone-canvas');
    const svg = element.querySelector('.svg-layer');
  
    if (!canvas || !svg) return;
  
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');
  
    // Draw base canvas image
    ctx.drawImage(canvas, 0, 0);
  
    // Create SVG copy with adjusted viewBox
    const clonedSvg = svg.cloneNode(true);
    clonedSvg.setAttribute('width', canvas.width);
    clonedSvg.setAttribute('height', canvas.height);
    clonedSvg.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
  
    // Serialize and render SVG
    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const svgImage = new Image();
  
    svgImage.onload = () => {
      // Draw SVG overlay at exact canvas dimensions
      ctx.drawImage(svgImage, 0, 0, canvas.width, canvas.height);
      
      // Export as PNG
      const dataURL = exportCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = 'capture-with-annotations.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };
  
    svgImage.src = url;*/
  };




  function bookmark() {
    console.log(frameIndex)
    const bookmarkedindex = frameIndex
    setbookmarkarray(prev => [...prev, bookmarkedindex])

    getBookmarkLeft(bookmarkedindex, totalFrames)
    setbookmark(true)
    console.log('book mark added')
  }
  const getBookmarkLeft = (bookmarkedindex: number, totalFrames: number) => {
    if (bookmarkedindex == null || totalFrames <= 1) return '0%';
    const percent = (bookmarkedindex / (totalFrames - 1)) * 100 + 2.12;
    console.log(percent)
    return `${percent.toFixed(2)}%`;  // :white_check_mark: Keep two decimal places for precision
  };


  useEffect(() => {
    console.log(bookmarkarray)
  })
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6">
      <h2 className="text-xl font-bold mb-4">DICOM Video Viewer</h2>

      <div className="w-full max-w-4xl flex">
        <div className="flex-1">
          {loaded && (
            <div className="flex flex-wrap justify-center gap-3 mb-4">
              {[RectangleROITool, PanTool, ZoomTool, WindowLevelTool, LengthTool, EllipticalROITool, AngleTool].map((Tool) => (
                <button
                  key={Tool.toolName}
                  onClick={() => handleToolChange(Tool.toolName)}
                  className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-sm"
                >
                  {Tool.toolName}
                </button>
              ))}
              <button className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-sm" onClick={handlePrev}>
                &lt; Prev
              </button>

              <button
                className='bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-sm'
                onClick={handlePlayPause}
              >
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>

              <button className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-sm" onClick={handleNext}>
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
              <button className="bg-purple-600 px-3 py-1 rounded hover:bg-purple-500 mt-2" >
                Get Measurements
              </button>
              <button className="bg-purple-600 px-3 py-1 rounded hover:bg-purple-500 mt-2" onClick={capture}>
                Capture
              </button>
              <button className="bg-purple-600 px-3 py-1 rounded hover:bg-purple-500 mt-2" onClick={bookmark}>
                Bookmark
              </button>
            </div>
          )}

          <div ref={elementRef} className="border border-gray-500 bg-gray-900 mx-auto" style={{ width: '512px', height: '412px', touchAction: 'none' }} />

          <div className="mt-2 text-center">
            Frame: {frameIndex + 1} of {totalFrames} | Status: {isPlaying ? 'Playing' : 'Paused'}
          </div>

          <div className="relative w-full px-4 py-6">

            <input
              type="range"
              min="0"
              max={Math.max(totalFrames - 1, 0)}
              value={frameIndex}
              onChange={handleSliderChange}
              className="w-full relative z-10 mt-2"
            // Optional: to set bookmark
            />
            {/* Bookmarks Track Layer */}
            <div className="absolute top-9.5 left-0 w-full h-0 z-1000">
              {bookmarklabel && (
                bookmarkarray.map((bookmarkedframe, index) => (
                  <div
                    key={index}
                    className="absolute"
                    style={{
                      left: getBookmarkLeft(bookmarkedframe, totalFrames),
                      transform: 'translate(-9%,-12%)',
                    }}
                  >
                    <div className="w-4 h-4 bg-yellow-300 rounded-full border border-black shadow-md"></div>
                  </div>
                ))

              )}
            </div>
            {/* Actual Input */}
          </div>

        </div>

      </div>
    </div>
  );
}
