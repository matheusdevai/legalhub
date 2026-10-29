// Uso: swift tts.swift <voice-identifier> <arquivo-texto> <saida.caf> [taxa 0..1]
// Sintetiza com AVSpeechSynthesizer (permite escolher a voz pelo identificador
// exato, inclusive Premium/neural, coisa que o `say` não faz).
import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count >= 4 else { fputs("uso: tts <voiceId> <texto.txt> <saida.caf> [rate]\n", stderr); exit(2) }
let voiceId = args[1]
let text = try! String(contentsOfFile: args[2], encoding: .utf8)
let outURL = URL(fileURLWithPath: args[3])
let rate = args.count > 4 ? Float(args[4]) ?? AVSpeechUtteranceDefaultSpeechRate : AVSpeechUtteranceDefaultSpeechRate

guard let voice = AVSpeechSynthesisVoice(identifier: voiceId) else { fputs("voz não encontrada: \(voiceId)\n", stderr); exit(3) }
let utt = AVSpeechUtterance(string: text)
utt.voice = voice
utt.rate = rate

let synth = AVSpeechSynthesizer()
var file: AVAudioFile?
var done = false
synth.write(utt) { buffer in
  guard let pcm = buffer as? AVAudioPCMBuffer else { return }
  if pcm.frameLength == 0 { done = true; return }
  if file == nil {
    file = try? AVAudioFile(forWriting: outURL, settings: pcm.format.settings, commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
  }
  try? file?.write(from: pcm)
}
let deadline = Date().addingTimeInterval(120)
while !done && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
if file == nil { fputs("nenhum áudio gerado\n", stderr); exit(4) }
print("ok")
