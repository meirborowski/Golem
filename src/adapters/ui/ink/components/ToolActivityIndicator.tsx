import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme, icons } from "../theme.js";

const golemPhrases = [
  // Golem & clay
  "Doing golem things...",
  "Shaping the clay...",
  "Molding raw earth...",
  "Animating the construct...",
  "Inscribing the shem...",
  "Awakening the golem...",
  "Etching life into clay...",
  "Sculpting from mud...",
  "Breathing life into stone...",
  "Firing up the kiln...",

  // Magic & spells
  "Summoning code...",
  "Channeling magic...",
  "Weaving spells...",
  "Casting incantations...",
  "Drawing sigils...",
  "Invoking the arcane...",
  "Conjuring solutions...",
  "Binding enchantments...",
  "Whispering to the ether...",
  "Unraveling hex strings...",
  "Mixing reagents...",
  "Chanting softly...",
  "Tracing glyphs...",
  "Opening a portal...",
  "Aligning the stars...",

  // Potions & alchemy
  "Brewing potions...",
  "Distilling logic...",
  "Transmuting data...",
  "Stirring the cauldron...",
  "Measuring the elixir...",
  "Extracting essences...",
  "Bottling lightning...",
  "Fermenting ideas...",
  "Refining the formula...",

  // Runes & scrolls
  "Consulting the runes...",
  "Sifting through scrolls...",
  "Decoding mysteries...",
  "Reading ancient texts...",
  "Translating glyphs...",
  "Unrolling parchment...",
  "Studying the tome...",
  "Deciphering symbols...",
  "Parsing the prophecy...",
  "Cross-referencing lore...",

  // Forging & building
  "Forging solutions...",
  "Assembling artifacts...",
  "Hammering hot iron...",
  "Tempering the blade...",
  "Riveting components...",
  "Welding logic gates...",
  "Polishing the gem...",
  "Carving the keystone...",
  "Laying the foundation...",
  "Raising the walls...",

  // Tech & bytes
  "Crunching bytes...",
  "Flipping bits...",
  "Shuffling packets...",
  "Defragmenting thoughts...",
  "Compiling wisdom...",
  "Optimizing the pipeline...",
  "Indexing the universe...",
  "Reticulating splines...",
  "Calibrating flux...",
  "Warming up the cores...",
  "Spinning up threads...",
  "Garbage collecting...",
  "Allocating memory...",
  "Resolving dependencies...",
  "Linking symbols...",

  // Exploration & adventure
  "Venturing deeper...",
  "Exploring the catacombs...",
  "Mapping the labyrinth...",
  "Navigating the maze...",
  "Following the trail...",
  "Searching the archives...",
  "Digging through layers...",
  "Spelunking for answers...",
  "Charting unknown waters...",
  "Scouting ahead...",

  // Playful & whimsical
  "Asking the rubber duck...",
  "Feeding the hamsters...",
  "Winding the gears...",
  "Polishing the monocle...",
  "Tuning the crystal...",
  "Herding the electrons...",
  "Untangling spaghetti...",
  "Stacking the turtles...",
  "Poking the bits...",
  "Wiggling the antennas...",
  "Dusting off the abacus...",
  "Shaking the magic 8-ball...",
  "Consulting the oracle...",
  "Pleasing the demo gods...",
  "Appeasing the linter...",

  // Cosmic & mystical
  "Harnessing starlight...",
  "Bending spacetime...",
  "Folding dimensions...",
  "Communing with the void...",
  "Riding the data stream...",
  "Surfing the astral plane...",
  "Tapping the ley lines...",
  "Gathering cosmic dust...",
  "Weaving the threads of fate...",
  "Peering beyond the veil...",
];

interface ToolActivityIndicatorProps {
  toolCount: number;
}

export function ToolActivityIndicator({ toolCount }: ToolActivityIndicatorProps) {
  const [phraseIndex, setPhraseIndex] = useState(
    () => Math.floor(Math.random() * golemPhrases.length),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % golemPhrases.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box>
      <Text color={theme.brand}>
        <Spinner type="dots" />
      </Text>
      <Text> </Text>
      <Text color={theme.assistantText}>{golemPhrases[phraseIndex]}</Text>
      <Text>  </Text>
      <Text color={theme.toolLabel}>
        {icons.tool} {toolCount} tool{toolCount !== 1 ? "s" : ""}
      </Text>
    </Box>
  );
}
