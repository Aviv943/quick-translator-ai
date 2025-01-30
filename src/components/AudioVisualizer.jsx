import { useEffect, useRef } from 'react';

// eslint-disable-next-line react/prop-types
const AudioVisualizer = ({ audioStream }) => {
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  useEffect(() => {
    if (!audioStream) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(audioStream);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 128;
    source.connect(analyser);
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;

      analyser.getByteFrequencyData(dataArrayRef.current);
      canvasCtx.clearRect(0, 0, width, height);

      const gap = 2;
      const barWidth = Math.floor((width * 0.8) / dataArrayRef.current.length) - gap;
      const totalWidth = (dataArrayRef.current.length * (barWidth + gap)) - gap;
      const startX = (width - totalWidth) / 2;

      let x = startX;

      dataArrayRef.current.forEach((value) => {
        const minHeight = height * 0.1;
        const barHeight = Math.max((value / 255) * height, minHeight);

        const gradient = canvasCtx.createLinearGradient(0, height - barHeight, 0, height);
        gradient.addColorStop(0, 'rgb(59, 130, 246)');
        gradient.addColorStop(1, 'rgb(37, 99, 235)');

        canvasCtx.beginPath();
        canvasCtx.roundRect(x, height - barHeight, barWidth, barHeight, 4);
        canvasCtx.fillStyle = gradient;
        canvasCtx.fill();

        x += barWidth + gap;
      });

      animationFrameId.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      audioContext.close();
    };
  }, [audioStream]);

  return (
      <div className="flex justify-center w-full">
        <canvas
            ref={canvasRef}
            width="300"
            height="80"
            className="rounded-lg bg-gray-50/30 backdrop-blur-sm shadow-inner"
        />
      </div>
  );
};

export default AudioVisualizer;