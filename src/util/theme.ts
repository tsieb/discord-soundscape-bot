import { ColorResolvable, EmbedBuilder } from 'discord.js';

/**
 * Centralized bot theming — colors, icons, and branding applied to all embeds.
 *
 * Emoji icons are used instead of hosted images so the bot works out of the box
 * with zero external dependencies.
 */

export const BotBrand = {
  /** Display name shown in embed footers and titles. */
  name: 'Soundscape Bot',

  /** Default embed accent color (deep teal — evokes ambient/nature vibes). */
  color: 0x2dd4bf as ColorResolvable,

  /** Footer tagline appended to rich embeds. */
  footerText: 'Soundscape Bot — ambient vibes on demand',
} as const;

/** Emoji prefixes for each embed category. */
export const Icons = {
  help: '\u{1F3B6}',       // 🎶
  status: '\u{1F4E1}',     // 📡
  config: '\u{2699}\uFE0F', // ⚙️
  sounds: '\u{1F50A}',     // 🔊
  success: '\u{2705}',     // ✅
  warning: '\u{26A0}\uFE0F', // ⚠️
  info: '\u{1F4AC}',       // 💬
} as const;

/** Context-specific embed colors for visual distinction. */
export const EmbedColors = {
  primary: 0x2dd4bf as ColorResolvable,   // teal  — default / informational
  success: 0x22c55e as ColorResolvable,   // green — confirmations & updates
  warning: 0xf59e0b as ColorResolvable,   // amber — warnings & resets
  neutral: 0x6b7280 as ColorResolvable,   // gray  — idle / empty states
} as const;

/**
 * Create a pre-styled EmbedBuilder with the bot's brand color and footer.
 * All command embeds should start from this so styling stays consistent.
 */
export const brandedEmbed = (
  color: ColorResolvable = EmbedColors.primary,
): EmbedBuilder => {
  return new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: BotBrand.footerText });
};
