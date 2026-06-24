import assert from "node:assert/strict";
import test from "node:test";

import { buildExtractAudioArgs } from "../src/processes.js";

test("buildExtractAudioArgs uses direct extraction for a single media file", () => {
  const args = buildExtractAudioArgs(["C:\\work\\input\\original.mp4"], "C:\\work\\work\\audio.wav");

  assert.deepEqual(args, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    "C:\\work\\input\\original.mp4",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "C:\\work\\work\\audio.wav"
  ]);
});

test("buildExtractAudioArgs concatenates multiple media inputs in order", () => {
  const args = buildExtractAudioArgs(
    ["C:\\work\\input\\original_01.mp4", "C:\\work\\input\\original_02.mp4"],
    "C:\\work\\work\\audio.wav"
  );

  assert.deepEqual(args, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    "C:\\work\\input\\original_01.mp4",
    "-i",
    "C:\\work\\input\\original_02.mp4",
    "-filter_complex",
    "[0:a:0][1:a:0]concat=n=2:v=0:a=1[outa]",
    "-map",
    "[outa]",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "C:\\work\\work\\audio.wav"
  ]);
});
