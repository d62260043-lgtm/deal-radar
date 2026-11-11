import os, sys
import torch

text_file, out_wav = sys.argv[1], sys.argv[2]
speaker = os.environ.get('TTS_SPEAKER', 'aidar')
text = open(text_file, encoding='utf-8').read().strip()

torch.set_num_threads(max(1, (os.cpu_count() or 4) - 1))
model_file = '/tmp/v4_ru.pt'
if not os.path.exists(model_file):
    torch.hub.download_url_to_file('https://models.silero.ai/models/tts/ru/v4_ru.pt', model_file)

model = torch.package.PackageImporter(model_file).load_pickle('tts_models', 'model')
model.to(torch.device('cpu'))
audio = model.apply_tts(text=text, speaker=speaker, sample_rate=48000)
import torchaudio
torchaudio.save(out_wav, audio.unsqueeze(0), 48000)
print('silero ok: %d сэмплов' % audio.shape[0])
