'use client';

import React, { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

interface SketchfabBackgroundProps {
  modelId: string;
}

export function SketchfabBackground({ modelId }: SketchfabBackgroundProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isInitialized = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const initViewer = () => {
    // @ts-ignore
    if (!window.Sketchfab || !iframeRef.current || isInitialized.current) return;
    isInitialized.current = true;
    
    // @ts-ignore
    const client = new window.Sketchfab(iframeRef.current);
    
    client.init(modelId, {
      autostart: 1,
      ui_theme: "dark",
      ui_infos: 0,
      ui_watermark: 0,
      ui_controls: 0,
      ui_annotations: 0,
      ui_animations: 0,
      ui_help: 0,
      ui_settings: 0,
      ui_vr: 0,
      ui_fullscreen: 0,
      ui_inspector: 0,
      ui_stop: 0,
      ui_hint: 0,
      transparent: 0,
      annotations_visible: 0,
      scrollwheel: 0,
      max_framerate: 120,
      framerate: 120,
      preload: 1, // Preload to prevent jagged edges and pop-in
      success: (api: any) => {
        api.start();
        api.addEventListener('viewerready', () => {
          setIsLoaded(true);
          
          api.getAnnotationList((err: any, annotations: any[]) => {
            if (err || !annotations || !annotations.length) return;
            
            // Forcibly hide every physical 3D marker in the scene immediately
            annotations.forEach((_, i) => api.hideAnnotation(i));
            
            let currentIndex = 0;
            // Restrict camera to not show angle 14 and onwards
            const maxIndex = Math.min(annotations.length - 1, 13);
            
            // @ts-ignore
            if (window.__sketchfabTimeout) clearTimeout(window.__sketchfabTimeout);
            
            const flyToNext = () => {
              const ann = annotations[currentIndex];
              
              if (ann && ann.eye && ann.target) {
                // Extremely smooth, slow cinematic pan
                api.setCameraLookAt(ann.eye, ann.target, 8.0);
              }
              
              currentIndex++;
              if (currentIndex > maxIndex) {
                currentIndex = 0;
              }
              
              // @ts-ignore
              window.__sketchfabTimeout = setTimeout(flyToNext, 8500);
            };
            
            // Give it 1 second to fully render before starting the tour
            setTimeout(() => {
              flyToNext();
            }, 1000);
          });
        });
      },
      error: () => {
        isInitialized.current = false;
        console.error("Sketchfab API error");
      }
    });
  };

  useEffect(() => {
    // @ts-ignore
    if (window.Sketchfab && iframeRef.current && !isInitialized.current) {
      initViewer();
    }
    return () => {
      // @ts-ignore
      if (window.__sketchfabTimeout) clearTimeout(window.__sketchfabTimeout);
    };
  }, []);

  return (
    <>
      <Script 
        src="https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js" 
        strategy="afterInteractive"
        onLoad={initViewer}
      />
      <div className="absolute inset-0 z-0 bg-black pointer-events-none">
        <iframe
          ref={iframeRef}
          title="Sketchfab Background"
          frameBorder="0"
          allowFullScreen
          // @ts-ignore
          mozallowfullscreen="true"
          // @ts-ignore
          webkitallowfullscreen="true"
          allow="autoplay; fullscreen; xr-spatial-tracking"
          // @ts-ignore
          xr-spatial-tracking="true"
          // @ts-ignore
          execution-while-out-of-viewport="true"
          // @ts-ignore
          execution-while-not-rendered="true"
          // @ts-ignore
          web-share="true"
          className="w-full h-full scale-[1.1]"
        />
      </div>
    </>
  );
}
