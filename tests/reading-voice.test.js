/* Listen: what is read aloud, and how the player behaves. Plain script, no DOM. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'reading-voice.js'), 'utf8'), context, { filename: 'reading-voice.js' });
const V = context.PhloemVoice;
const plain = value => JSON.parse(JSON.stringify(value));
const spoken = blocks => plain(V.prepare(blocks).chunks.map(chunk => chunk.text));

test('citations, figure pointers and links are not read; names in a sentence stay', () => {
  assert.equal(V.stripCitations('Sucrose loading [12, 14–16] is regulated (Chiou and Bush, 1998; Vaughn et al., 2002), as Smith et al. (2020) showed (Fig. 3B).'),
    'Sucrose loading is regulated, as Smith et al. showed.');
  assert.equal(V.stripCitations('The sample (n = 12, 2019 season) held.'), 'The sample (n = 12, 2019 season) held.', 'statistics in parentheses stay');
  assert.equal(V.stripCitations('Data are at https://example.org/x and doi:10.1/abc here.'), 'Data are at and here.');
});

test('sentences do not break after et al., e.g., Fig. or an initial, and long ones are cut at a comma', () => {
  assert.deepEqual(plain(V.sentences('Osorio et al. found it. See Fig. 2 for e.g. the leaves. J. Smith agreed. It works.')),
    ['Osorio et al. found it.', 'See Fig. 2 for e.g. the leaves.', 'J. Smith agreed.', 'It works.']);
  const long = V.sentences('A, '.repeat(80) + 'end.');
  assert.ok(long.length > 1 && long.every(chunk => chunk.length <= 240));
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'reading-voice.js'), 'utf8'), /\(\?<[=!]/, 'no look-behind: older iPadOS Safari cannot parse it');
});

test('tables, header rows, formulas and figure labels are recognised', () => {
  assert.equal(V.tableLike('12.3 ± 0.4 15.2 ± 1.1 18.9 ± 0.9 n.s.'), true);
  assert.equal(V.tableLike('MAE PDE MAE PDE MAE PDE'), true);
  assert.equal(V.tableLike('The rate rose from 12 to 15 in 2019.'), false);
  assert.equal(V.tableLike('As mentioned above some studies postulate apoplastic unloading from phloem throughout tomato fruit development and the of the of the and the'), false, 'long prose repeats words too');
  assert.equal(V.formulaLike('V = Vmax · C / (Km + C)'), true);
  assert.equal(V.formulaLike('Xext ¼ ðxext;i Þt'), true, 'math fonts read as ¼ ð þ');
  assert.equal(V.formulaLike('FNO ρ = 0.82 0.0008'), true);
  assert.equal(V.formulaLike('The value was p = 0.05 in every case.'), false);
});

test('a paper is read from the title and abstract to the end of the argument', () => {
  const blocks = [
    { text: 'Diffusion models for unobserved states', kind: 'h1', page: 1, para: 0 },
    { text: 'Ada Lovelace 1,2 *, Alan Turing 2', kind: '', page: 1, para: 1 },
    { text: 'Department of Computer Science, Aalto University, Espoo, Finland', kind: 'h3', page: 1, para: 2 },
    { text: 'ABSTRACT', kind: 'h3', page: 1, para: 3 },
    { text: 'We study plants [3].', page: 1, para: 4 },
    { text: 'arXiv:2405.07097v2 [cs.LG] 15 Dec 2024', kind: 'h1', page: 1, para: 5 },
    { text: '1. INTRODUCTION', kind: '', page: 1, para: 6 },
    { text: 'Sinks pull sugar (Osorio et al., 2014).', page: 1, para: 7 },
    { text: 'E-mail: {first}@aalto.fi This work was supported by the Council.', page: 1, para: 8 },
    { text: '979-8-3503-7225-0/24/$31.00 ©2024 IEEE', page: 1, para: 9 },
    { text: 'x = y + z', kind: 'eq', page: 2, para: 10 },
    { text: 'Figure 1. A leaf.', kind: 'cap', page: 2, para: 11 },
    { text: 'u Height', page: 2, para: 12 },
    { text: 'Training input u each h', page: 2, para: 13 },
    { text: 'MAE PDE MAE PDE MAE PDE', page: 2, para: 14 },
    { text: '3.1. Background on diffusion models', page: 2, para: 15 },
    { text: 'Diffusion denoises.', page: 2, para: 16 },
    { text: 'Acknowledgments', kind: 'h3', page: 5, para: 17 },
    { text: 'We thank Bob.', page: 5, para: 18 },
    { text: 'References', kind: 'h2', page: 5, para: 19 },
    { text: '[1] A. Smith, 2020.', page: 5, para: 20 },
    { text: 'Appendix S7. Mathematical demonstration.', kind: 'h3', page: 6, para: 21 },
    { text: 'Appendix A', kind: 'h2', page: 6, para: 22 },
    { text: 'More detail here.', page: 6, para: 23 }
  ];
  assert.deepEqual(spoken(blocks), ['Diffusion models for unobserved states', 'ABSTRACT', 'We study plants.', 'INTRODUCTION', 'Sinks pull sugar.',
    'Background on diffusion models', 'Diffusion denoises.', 'Appendix A', 'More detail here.']);
  const skipped = plain(V.prepare(blocks).skipped);
  assert.equal(skipped.references, true);
  assert.equal(skipped.equations, 1);
  assert.equal(skipped.captions, 1);
});

test('without an Abstract heading nothing after the title is skipped except bylines', () => {
  assert.deepEqual(spoken([
    { text: 'An update on source-to-sink carbon partitioning in tomato', kind: 'h1', page: 1 },
    { text: 'Max-Planck-Institut für Molekulare Pflanzenphysiologie, Potsdam-Golm, Germany', kind: 'h3', page: 1 },
    { text: 'Plant growth and carbon metabolism are closely associated.', page: 1 },
    { text: 'INTRODUCTION', kind: 'h3', page: 1 }
  ]), ['An update on source-to-sink carbon partitioning in tomato', 'Plant growth and carbon metabolism are closely associated.', 'INTRODUCTION']);
});

test('voices: Jamie first, then Premium and Enhanced; novelty and Eloquence voices hidden; each person once', () => {
  // The English voices on Houfu's Mac (Oct 2026), as Chromium lists them.
  const names = ['Samantha', 'Albert', 'Ava', 'Ava (Enhanced)', 'Ava (Premium)', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Daniel',
    'Eddy (English (United States))', 'Flo (English (United Kingdom))', 'Fred', 'Good News', 'Grandma (English (United States))', 'Grandpa (English (United Kingdom))',
    'Jamie (Premium)', 'Jester', 'Junior', 'Karen', 'Kathy', 'Moira', 'Organ', 'Ralph', 'Reed (English (United States))', 'Rishi',
    'Rocko (English (United States))', 'Sandy (English (United States))', 'Serena (Premium)', 'Shelley (English (United States))', 'Superstar', 'Tessa',
    'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Zoe (Premium)'];
  const lang = name => ({ Daniel: 'en-GB', 'Jamie (Premium)': 'en-GB', 'Serena (Premium)': 'en-GB', Karen: 'en-AU', Moira: 'en-IE', Rishi: 'en-IN', Tessa: 'en-ZA' })[name] || 'en-US';
  const voices = names.map(name => ({ name, voiceURI: name, lang: lang(name), localService: true, default: name === 'Samantha' })).concat([{ name: 'Thomas', lang: 'fr-FR' }]);
  assert.deepEqual(plain(V.rankVoices(voices).map(voice => voice.name)),
    ['Jamie (Premium)', 'Serena (Premium)', 'Ava (Premium)', 'Zoe (Premium)', 'Samantha', 'Daniel', 'Karen', 'Moira', 'Rishi', 'Tessa']);
  assert.equal(V.oddVoice({ name: 'Bahh', voiceURI: 'com.apple.speech.synthesis.voice.Bahh' }), true);
  assert.equal(V.oddVoice({ name: 'Eddy', voiceURI: 'com.apple.eloquence.en-US.Eddy' }), true);
  assert.equal(V.oddVoice({ name: 'Samantha', voiceURI: 'com.apple.voice.compact.en-US.Samantha' }), false);
  assert.equal(V.oddVoice({ name: 'Alex', voiceURI: 'com.apple.speech.synthesis.voice.Alex' }), false, 'Alex shares the novelty voices\' identifier prefix but is a real voice');
  assert.deepEqual(plain(V.rankVoices([{ name: 'Bahh', lang: 'en-US' }]).map(voice => voice.name)), ['Bahh'], 'a device with only odd voices still gets one');
});

function fakeEnv() {
  const said = [], states = [], timers = [];
  class Utterance { constructor(text) { this.text = text; } }
  const synth = { speaking: false, pending: false, current: null, cancelled: 0,
    speak(utterance) { said.push(utterance.text); this.current = utterance; this.speaking = true; },
    cancel() { this.cancelled++; this.speaking = false; },
    finish() { const u = this.current; this.speaking = false; u.onend(); } };
  const env = { synth, Utterance, onState: state => states.push(state),
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} };
  return { env, said, states, synth, flush: () => { while (timers.length) timers.shift()(); } };
}
test('the player reads in order, pauses on a heading, and resumes the same sentence', () => {
  const f = fakeEnv(), player = V.createPlayer(f.env);
  player.load([{ text: 'Intro', kind: 'heading' }, { text: 'One.' }, { text: 'Two.' }, { text: 'Three.' }], 0);
  player.play();
  assert.deepEqual(f.said, ['Intro']);
  f.synth.finish(); f.flush();
  assert.deepEqual(f.said, ['Intro', 'One.'], 'a short pause after a heading, then on');
  f.synth.finish();
  assert.deepEqual(f.said.slice(-1), ['Two.']);
  player.pause();
  assert.equal(player.state(), 'paused');
  player.play(); f.flush();
  assert.deepEqual(f.said.slice(-1), ['Two.'], 'resuming restarts the interrupted sentence');
  player.next(); f.flush();
  assert.deepEqual(f.said.slice(-1), ['Three.']);
  player.back(); f.flush();
  assert.deepEqual(f.said.slice(-1), ['Two.']);
  f.synth.finish(); f.synth.finish();
  assert.equal(player.state(), 'finished');
});
test('a cancelled utterance never advances the player', () => {
  const f = fakeEnv(), player = V.createPlayer(f.env);
  player.load([{ text: 'One.' }, { text: 'Two.' }], 0);
  player.play();
  const first = f.synth.current;
  player.pause();
  first.onerror({ error: 'interrupted' });
  first.onend();
  assert.equal(player.index(), 0);
  assert.equal(player.state(), 'paused');
});

test('natural voices are told apart from the basic ones a device starts with', () => {
  const natural = voice => V.naturalVoice(voice);
  assert.equal(natural({ name: 'Jamie (Premium)', voiceURI: 'com.apple.voice.premium.en-GB.Jamie' }), true);
  assert.equal(natural({ name: 'Ava', voiceURI: 'com.apple.voice.enhanced.en-US.Ava' }), true, 'Safari may drop the label from the name');
  assert.equal(natural({ name: 'Microsoft Aria Online (Natural) - English (United States)', voiceURI: 'x' }), true);
  assert.equal(natural({ name: 'Google UK English Female', voiceURI: 'Google UK English Female' }), true);
  assert.equal(natural({ name: 'Samantha', voiceURI: 'com.apple.voice.compact.en-US.Samantha' }), false);
  assert.equal(natural({ name: 'Microsoft David - English (United States)', voiceURI: 'x' }), false);
});

test('the voice guide gives steps for the device, ending back in Phloem', () => {
  for (const platform of ['ios', 'mac', 'android', 'windows', 'other']) {
    const help = V.voiceHelp(platform);
    assert.ok(help.title && help.steps.length >= 1, platform);
  }
  assert.match(V.voiceHelp('ios').steps.join(' '), /Accessibility, then Read & Speak.*Voices, then English.*Jamie.*Premium/);
  assert.match(V.voiceHelp('ios').steps.at(-1), /Come back to Phloem/);
  assert.match(V.voiceHelp('mac').steps.join(' '), /Manage Voices/);
});
