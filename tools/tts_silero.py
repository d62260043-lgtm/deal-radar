import os, sys, wave
import numpy as np
import torch

text_file, out_wav = sys.argv[1], sys.argv[2]
speaker = os.environ.get('TTS_SPEAKER', 'eugene')
text = open(text_file, encoding='utf-8').read().strip()

torch.set_num_threads(max(1, (os.cpu_count() or 4) - 1))
model_file = '/tmp/v4_ru.pt'
if not os.path.exists(model_file):
    torch.hub.download_url_to_file('https://models.silero.ai/models/tts/ru/v4_ru.pt', model_file)

model = torch.package.PackageImporter(model_file).load_pickle('tts_models', 'model')
model.to(torch.device('cpu'))

rate = 48000
audio = model.apply_tts(text=text, speaker=speaker, sample_rate=rate)
arr = audio.detach().cpu().numpy()
arr = np.clip(arr, -1.0, 1.0)
pcm = (arr * 32767.0).astype(np.int16)

with wave.open(out_wav, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(pcm.tobytes())

print('silero ok: %.1f с, спикер %s' % (len(pcm) / rate, speaker))
