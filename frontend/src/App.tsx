import React, { useState, useEffect } from 'react';
import './index.css';
import { LANGUAGES } from './languages';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

function App() {
  const [activeTab, setActiveTab] = useState<'inference' | 'library'>('inference');
  
  // State for Inference
  const [voices, setVoices] = useState<string[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('Auto');
  const [selectedLang, setSelectedLang] = useState<string>('Auto');
  const [text, setText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  // Advanced Settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [numSteps, setNumSteps] = useState<number>(32);
  const [guidanceScale, setGuidanceScale] = useState<number>(2.0);
  const [seed, setSeed] = useState<string>(''); // string to allow empty input
  
  // State for adding voice
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newVoiceText, setNewVoiceText] = useState('');
  const [newVoiceFile, setNewVoiceFile] = useState<File | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addMsg, setAddMsg] = useState({ type: '', text: '' });

  const fetchVoices = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/voices`);
      const data = await res.json();
      setVoices(data.voices || []);
    } catch (e) {
      console.error("Failed to fetch voices", e);
    }
  };

  useEffect(() => {
    fetchVoices();
  }, [activeTab]);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    setAudioUrl(null);
    try {
      const payload = {
        text,
        voice_name: selectedVoice === 'Auto' ? null : selectedVoice,
        language: selectedLang === 'Auto' ? null : selectedLang,
        num_step: numSteps,
        guidance_scale: guidanceScale,
        seed: seed.trim() !== '' ? parseInt(seed) : null
      };
      
      const res = await fetch(`${API_BASE_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
         const errorText = await res.text();
         throw new Error(errorText);
      }
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e: any) {
      alert("Generation failed: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVoiceName || !newVoiceFile) {
        setAddMsg({ type: 'error', text: 'Name and Audio File are required.'});
        return;
    }
    
    setIsAdding(true);
    setAddMsg({ type: '', text: '' });
    
    const formData = new FormData();
    formData.append('name', newVoiceName);
    formData.append('ref_audio', newVoiceFile);
    if (newVoiceText.trim()) {
        formData.append('ref_text', newVoiceText);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/voices`, {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
         const err = await res.json();
         throw new Error(err.detail || "Failed to add voice");
      }
      
      const data = await res.json();
      setAddMsg({ type: 'success', text: `Voice '${data.name}' added! Auto-transcribed text: ${data.ref_text}` });
      setNewVoiceName('');
      setNewVoiceText('');
      setNewVoiceFile(null);
      fetchVoices();
    } catch (e: any) {
      setAddMsg({ type: 'error', text: e.message });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <>
      <div className="glass-panel" style={{ padding: '2rem 3rem', marginBottom: '2rem', textAlign: 'center' }}>
        <h1>OmniVoice TTS</h1>
        <p className="subtitle">High-quality zero-shot multilingual TTS with 600+ languages</p>
      </div>

      <div className="tabs">
        <button 
          className={`tab-btn ${activeTab === 'inference' ? 'active' : ''}`}
          onClick={() => setActiveTab('inference')}
        >
          Synthesize Speech
        </button>
        <button 
          className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          Voice Library
        </button>
      </div>

      {activeTab === 'inference' && (
        <div className="glass-panel animate-fade-in">
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Target Language</label>
                <select value={selectedLang} onChange={e => setSelectedLang(e.target.value)}>
                    <option value="Auto">Auto-Detect / Any</option>
                    {LANGUAGES.map(lang => (
                        <option key={lang} value={lang}>{lang}</option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label>Voice Clone</label>
                <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)}>
                    <option value="Auto">Random / Auto</option>
                    {voices.map(v => (
                        <option key={v} value={v}>{v}</option>
                    ))}
                </select>
              </div>
           </div>
           
           <div className="form-group">
             <label>Text to Synthesize</label>
             <textarea 
               value={text} 
               onChange={e => setText(e.target.value)}
               placeholder="Enter text to convert to speech..."
               rows={4}
             />
           </div>

           <button 
             className="advanced-toggle" 
             onClick={() => setShowAdvanced(!showAdvanced)}
           >
             {showAdvanced ? '▼ Hide Advanced Settings' : '▶ Show Advanced Settings'}
           </button>

           {showAdvanced && (
             <div className="advanced-panel animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Inference Steps</label>
                  <input 
                    type="number" 
                    value={numSteps} 
                    onChange={e => setNumSteps(parseInt(e.target.value) || 32)} 
                    min={4} max={128} 
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Guidance Scale</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={guidanceScale} 
                    onChange={e => setGuidanceScale(parseFloat(e.target.value) || 2.0)} 
                    min={1} max={10} 
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Seed (Auto if blank)</label>
                  <input 
                    type="text" 
                    value={seed} 
                    onChange={e => setSeed(e.target.value.replace(/\D/g, ''))} 
                    placeholder="e.g. 42" 
                  />
                </div>
             </div>
           )}

           <button onClick={handleGenerate} disabled={isGenerating || !text.trim()} style={{ width: '100%', marginTop: '1rem' }}>
             {isGenerating ? <><span className="loader"></span> Synthesizing (this may take a bit)...</> : 'Generate Audio'}
           </button>

           {audioUrl && (
             <div style={{ marginTop: '2rem' }}>
               <label>Generated Output</label>
               <audio controls autoPlay src={audioUrl} className="audio-player"></audio>
             </div>
           )}
        </div>
      )}

      {activeTab === 'library' && (
        <div className="glass-panel animate-fade-in">
           <h2 style={{marginTop: 0}}>Add New Voice</h2>
           <p style={{ fontSize: '0.9em', color: '#8b949e', marginBottom: '1.5rem' }}>
             Provide a short reference audio clip (3-10 seconds of clear speech). If you leave the reference text blank, OmniVoice will load Whisper to auto-transcribe it, then free memory automatically.
           </p>

           <form onSubmit={handleAddVoice}>
             <div className="form-group">
               <label>Voice Name (ID)</label>
               <input 
                 type="text" 
                 required 
                 value={newVoiceName} 
                 onChange={e => setNewVoiceName(e.target.value)}
                 placeholder="e.g. jarvis, my_voice" 
               />
             </div>
             
             <div className="form-group">
               <label>Reference Audio File (.wav, .mp3, etc)</label>
               <input 
                 type="file" 
                 required 
                 accept="audio/*" 
                 onChange={e => setNewVoiceFile(e.target.files ? e.target.files[0] : null)}
               />
             </div>

             <div className="form-group">
               <label>Reference Transcript (Optional)</label>
               <textarea 
                 value={newVoiceText} 
                 onChange={e => setNewVoiceText(e.target.value)}
                 placeholder="Leave blank for automatic transcription via Whisper"
                 rows={2}
               />
             </div>

             <button type="submit" disabled={isAdding} style={{ marginTop: '1rem' }}>
                {isAdding ? <><span className="loader"></span> Processing Voice...</> : 'Save Voice to Library'}
             </button>

             {addMsg.text && (
                 <div className={addMsg.type === 'error' ? 'error' : 'success'}>
                     {addMsg.text}
                 </div>
             )}
           </form>

           <div style={{ marginTop: '3rem' }}>
             <h3>Saved Voices</h3>
             {voices.length === 0 ? (
                 <p style={{ color: '#8b949e' }}>No voices saved yet.</p>
             ) : (
                 <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                     {voices.map(v => (
                         <span key={v} style={{ background: 'rgba(255,255,255,0.1)', padding: '0.3em 0.8em', borderRadius: '16px', fontSize: '0.9em' }}>
                             {v}
                         </span>
                     ))}
                 </div>
             )}
           </div>
        </div>
      )}
    </>
  );
}

export default App;
