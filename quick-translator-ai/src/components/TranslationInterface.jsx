import { useState, useEffect, useRef } from 'react';
import { Settings, Languages, ArrowRightLeft, Mic, Square, Type } from 'lucide-react';
import AudioVisualizer from './AudioVisualizer';

const TranslationInterface = () => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [sourceLang, setSourceLang] = useState('Hebrew');
  const [targetLang, setTargetLang] = useState('English');
  const [showSettings, setShowSettings] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [inputMode, setInputMode] = useState('text');
  const [isRecording, setIsRecording] = useState(false);
  const [audioStream, setAudioStream] = useState(null);
  const [showEditableTranscription, setShowEditableTranscription] = useState(false);
  const [recordingError, setRecordingError] = useState('');

  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const recordingTimeout = useRef(null);
  const recordingStartTime = useRef(null);

  const [settings, setSettings] = useState({
    model: localStorage.getItem('model') || 'gpt-4o',
    lowercase: localStorage.getItem('lowercase') === 'true' || false,
    apiKey: localStorage.getItem('apiKey') || '',
    editTranscriptionBeforeTranslate: localStorage.getItem('editTranscriptionBeforeTranslate') === 'true' || false,
    recordingTimeLimit: parseInt(localStorage.getItem('recordingTimeLimit')) || 5
  });

  useEffect(() => {
    return () => {
      if (recordingTimeout.current) {
        clearTimeout(recordingTimeout.current);
      }
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [audioStream]);

  const getAvailableLanguages = (isSource) => {
    const allLanguages = [
      'English', 'Hebrew', 'Spanish', 'French', 'German', 'Italian', 'Russian', 'Arabic'
    ];

    if (isSource) {
      return allLanguages;
    } else {
      return allLanguages.filter(lang => lang !== 'Hebrew' && lang !== sourceLang);
    }
  };

  useEffect(() => {
    if (targetLang === sourceLang || (sourceLang === 'Hebrew' && targetLang === 'Hebrew')) {
      setTargetLang(sourceLang === 'English' ? 'Spanish' : 'English');
    }
  }, [sourceLang, targetLang]);

  const startRecording = async () => {
    if (recordingTimeout.current) {
      clearTimeout(recordingTimeout.current);
    }

    setRecordingError('');
    recordingStartTime.current = Date.now();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream);
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstop = async () => {
        const endTime = Date.now();
        const recordingDuration = (endTime - recordingStartTime.current) / 1000;

        if (recordingDuration > settings.recordingTimeLimit * 60) {
          setRecordingError(`Recording too long. Please limit to ${settings.recordingTimeLimit} minutes.`);
          audioChunks.current = [];
          setAudioStream(null);
          return;
        }

        const audioBlob = new Blob(audioChunks.current, { type: 'audio/mp3' });
        audioChunks.current = [];
        await processAudioWithWhisper(audioBlob);
        setAudioStream(null);
      };

      mediaRecorder.current.start();
      setIsRecording(true);

      recordingTimeout.current = setTimeout(() => {
        stopRecording();
        setRecordingError(`Recording time limit reached (${settings.recordingTimeLimit} minutes)`);
      }, settings.recordingTimeLimit * 60 * 1000);

    } catch (err) {
      setRecordingError('Error accessing microphone. Please check permissions.');
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (recordingTimeout.current) {
        clearTimeout(recordingTimeout.current);
      }
    }
  };

  const processAudioWithWhisper = async (blob) => {
    if (!settings.apiKey) return;

    setIsTranslating(true);
    try {
      const formData = new FormData();
      formData.append('file', blob);
      formData.append('model', 'whisper-1');
      formData.append('language', 'he');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const data = await response.json();
      setInputText(data.text);

      if (settings.editTranscriptionBeforeTranslate) {
        setShowEditableTranscription(true);
      } else {
        await handleTranslate(data.text);
      }
    } catch (error) {
      console.error('Transcription error:', error);
      setRecordingError('Transcription failed. Please try again.');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleTranslate = async (textToTranslate = inputText) => {
    if (!textToTranslate.trim() || !settings.apiKey) return;

    setShowEditableTranscription(false);
    setIsTranslating(true);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            {
              role: "system",
              content: "You are a professional translator who first deeply understands the text's meaning, context, and writer's voice before translating. You maintain the author's original style and intent in your translations."
            },
            {
              role: "user",
              content: `First understand, then translate:
                1. Read this ${sourceLang} text and understand:
                   - The writer's intent and context
                   - The key meanings behind each phrase
                   - The writer's tone and style
                
                2. Then translate to ${targetLang}, ensuring:
                   - Use everyday language at an intermediate level
                   - Keep the original meaning and context
                   - Maintain the writer's personal style
                   - Make it sound natural, as if written by the original author
                   - Use simple punctuation only (periods, commas, question marks, exclamation marks)
                   - Avoid complex punctuation like semicolons, em dashes, or parentheses
                
                Text to translate:
                ${textToTranslate}
                
                Translation:`
            }
          ],
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      const data = await response.json();
      const translatedText = data.choices[0].message.content.trim();
      setOutputText(settings.lowercase ? translatedText.toLowerCase() : translatedText);
    } catch (error) {
      console.error('Translation error:', error);
      setOutputText('Error: ' + error.message);
    } finally {
      setIsTranslating(false);
    }
  };

  const swapLanguages = () => {
    if (sourceLang !== 'Hebrew' && targetLang !== 'Hebrew') {
      const temp = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(temp);
    }
  };

  const handleSettingsSave = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);

    const newSettings = {
      model: formData.get('model'),
      lowercase: formData.get('lowercase') === 'on',
      apiKey: formData.get('apiKey'),
      editTranscriptionBeforeTranslate: formData.get('editTranscriptionBeforeTranslate') === 'on',
      recordingTimeLimit: Math.min(Math.max(parseInt(formData.get('recordingTimeLimit')) || 5, 1), 30)
    };

    setSettings(newSettings);
    localStorage.setItem('model', newSettings.model);
    localStorage.setItem('lowercase', newSettings.lowercase);
    localStorage.setItem('apiKey', newSettings.apiKey);
    localStorage.setItem('editTranscriptionBeforeTranslate', newSettings.editTranscriptionBeforeTranslate);
    localStorage.setItem('recordingTimeLimit', newSettings.recordingTimeLimit);
    setShowSettings(false);
  };

  const isRTL = sourceLang === 'Hebrew' || sourceLang === 'Arabic';

  return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 rounded-xl p-2">
                <Languages className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-800">QuickTranslatorAI</h1>
                <p className="text-sm text-gray-500">Fast and accurate translations</p>
              </div>
            </div>
            <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 shadow-sm"
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </button>
          </div>

          {/* Main translation interface */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Language selection bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2 flex-1">
                <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="px-4 py-2 rounded-lg bg-white border border-gray-200 shadow-sm hover:border-blue-300 transition-all cursor-pointer"
                >
                  {getAvailableLanguages(true).map(lang => (
                      <option key={`source-${lang}`} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <button
                  onClick={swapLanguages}
                  className="p-2 hover:bg-white rounded-full transition-all disabled:opacity-50"
                  disabled={sourceLang === 'Hebrew' || targetLang === 'Hebrew'}
              >
                <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              </button>

              <div className="flex items-center gap-2 flex-1 justify-end">
                <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="px-4 py-2 rounded-lg bg-white border border-gray-200 shadow-sm hover:border-blue-300 transition-all cursor-pointer"
                >
                  {getAvailableLanguages(false).map(lang => (
                      <option key={`target-${lang}`} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Input type selector */}
            <div className="flex justify-center gap-2 py-4 border-b border-gray-200">
              <button
                  onClick={() => {
                    setInputMode('text');
                    setShowEditableTranscription(false);
                  }}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                      inputMode === 'text' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
              >
                <Type className="w-5 h-5" />
                <span>Text</span>
              </button>
              <button
                  onClick={() => setInputMode('voice')}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                      inputMode === 'voice' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
              >
                <Mic className="w-5 h-5" />
                <span>Voice</span>
              </button>
            </div>

            {/* Input area */}
            <div className="p-6 border-b border-gray-200">
              {inputMode === 'text' || showEditableTranscription ? (
                  <div>
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={showEditableTranscription ? "Edit transcribed text..." : "Enter text to translate..."}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className={`w-full h-48 resize-none bg-transparent placeholder-gray-400 focus:outline-none ${
                        isRTL ? 'text-right' : 'text-left'
                    } text-lg`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleTranslate();
                      }
                    }}
                />
                    <div className="mt-4 flex flex-col items-center gap-2">
                      <div className="text-sm text-gray-400">
                        {inputText.length} characters
                      </div>
                      <div className="flex gap-2">
                        {showEditableTranscription && inputMode === 'voice' && (
                            <button
                                onClick={() => {
                                  setInputText('');
                                  setShowEditableTranscription(false);
                                }}
                                className="px-8 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all flex items-center gap-2 font-medium"
                            >
                              Back to Recording
                            </button>
                        )}
                        <button
                            onClick={() => handleTranslate()}
                            className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-2 font-medium"
                            disabled={isTranslating || !inputText.trim() || !settings.apiKey}
                        >
                          {isTranslating ? 'Translating...' : (showEditableTranscription ? 'Translate Edited Text' : 'Translate')}
                        </button>
                      </div>
                    </div>
                  </div>
              ) : (
                  <div className="flex flex-col items-center justify-center space-y-8">
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`p-6 rounded-full ${
                            isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
                        } text-white transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5`}
                        disabled={!!recordingError}
                    >
                      {isRecording ? (
                          <Square className="w-8 h-8" />
                      ) : (
                          <Mic className="w-8 h-8" />
                      )}
                    </button>

                    {audioStream && (
                        <div className="w-full max-w-md flex justify-center">
                          <AudioVisualizer audioStream={audioStream} />
                        </div>
                    )}

                    {recordingError && (
                        <div className="text-red-500 text-center px-4 py-2 bg-red-50 rounded-lg">
                          {recordingError}
                        </div>
                    )}

                    <div className="flex flex-col items-center space-y-2">
                      <p className="text-gray-600 text-lg">
                        {isRecording ? 'Click to stop recording' : 'Click to start recording'}
                      </p>
                      {settings.editTranscriptionBeforeTranslate && (
                          <p className="text-sm text-gray-500 max-w-sm text-center px-4">
                            You will be able to edit the transcribed text before translation
                          </p>
                      )}
                    </div>
                  </div>
              )}
            </div>

            {/* Output area */}
            <div className="p-6 bg-gray-50">
              {isTranslating ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  </div>
              ) : (
                  <div className="flex flex-col space-y-4">
                    <div className={`min-h-[100px] text-gray-600 ${
                        targetLang === 'Hebrew' ? 'text-right' : 'text-left'
                    } text-lg whitespace-pre-wrap break-words`}>
                      {outputText || <span className="text-gray-400">Translation will appear here...</span>}
                    </div>
                    {outputText && (
                        <div className="flex justify-center pt-2">
                          <button
                              onClick={() => {
                                navigator.clipboard.writeText(outputText);
                                setCopySuccess(true);
                                setTimeout(() => setCopySuccess(false), 2000);
                              }}
                              className={`px-8 py-2.5 rounded-lg transition-all flex items-center gap-2 font-medium ${
                                  copySuccess ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                              } text-white`}
                          >
                            {copySuccess ? 'Copied!' : 'Copy Translation'}
                          </button>
                        </div>
                    )}
                  </div>
              )}
            </div>
          </div>

          {/* Settings Modal */}
          {showSettings && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center backdrop-blur-sm">
                <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <Settings className="w-6 h-6 text-blue-600" />
                    <h2 className="text-xl font-semibold">Settings</h2>
                  </div>
                  <form onSubmit={handleSettingsSave}>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          OpenAI API Key
                        </label>
                        <input
                            type="password"
                            name="apiKey"
                            defaultValue={settings.apiKey}
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          AI Model
                        </label>
                        <select
                            name="model"
                            defaultValue={settings.model}
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        >
                          <option value="gpt-4o">GPT-4o (Recommended)</option>
                          <option value="gpt-4o-mini">GPT-4o-mini (Faster)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Maximum Recording Time (minutes)
                        </label>
                        <input
                            type="number"
                            name="recordingTimeLimit"
                            defaultValue={settings.recordingTimeLimit}
                            min="1"
                            max="30"
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Set a limit between 1-30 minutes (default: 5)
                        </p>
                      </div>

                      <div className="flex items-center bg-gray-50 p-3 rounded-lg">
                        <input
                            type="checkbox"
                            name="lowercase"
                            id="lowercase"
                            defaultChecked={settings.lowercase}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="lowercase" className="ml-2 block text-sm text-gray-700">
                          Convert translation to lowercase
                        </label>
                      </div>

                      <div className="flex items-center bg-gray-50 p-3 rounded-lg">
                        <input
                            type="checkbox"
                            name="editTranscriptionBeforeTranslate"
                            id="editTranscriptionBeforeTranslate"
                            defaultChecked={settings.editTranscriptionBeforeTranslate}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="editTranscriptionBeforeTranslate" className="ml-2 block text-sm text-gray-700">
                          Edit transcription before translation
                          <p className="text-xs text-gray-500 mt-1">
                            When enabled, you can review and edit the transcribed text before translation
                          </p>
                        </label>
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-2">
                      <button
                          type="button"
                          onClick={() => setShowSettings(false)}
                          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Save Changes
                      </button>
                    </div>
                  </form>
                </div>
              </div>
          )}

          {/* Helper text */}
          <div className="text-center text-gray-500 text-sm mt-4">
            {inputMode === 'text' ?
                'Press Enter or click Translate to start translation' :
                'Click the microphone button to start/stop recording'}
          </div>
        </div>
      </div>
  );
};

export default TranslationInterface;