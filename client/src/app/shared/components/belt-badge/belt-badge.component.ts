import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TagModule } from 'primeng/tag';
import { Belt, MAX_STRIPES_PER_BELT } from '../../../core/services/athlete.service';
import { BELT_KEYS } from '../../utils/i18n-enum-keys';

/**
 * Renders the IBJJF belt as a coloured pill, optionally with stripe markers
 * inline. The belt colors are *domain* values — see the SCSS file for the
 * CSS custom properties and the rationale for hardcoding them there (canon's
 * "unless the token truly doesn't exist" clause in client/CLAUDE.md §
 * Design canon).
 *
 * Stripes are rendered as small filled tiles inside the pill, after the
 * belt label (#165). White-belt rows use dark tiles; coloured rows use
 * light tiles — so the stripe count is glanceable on every belt without
 * a separate column.
 *
 * Two **appearances** of the same fact (#1429):
 *
 * - `badge` — the pill, with the belt's name written on it.
 * - `spine` — a vertical bar for the left edge of a roster row, with no
 *   text at all. Rank is the first thing an instructor sorts people by, and
 *   a colour down the side turns "who are my blue belts" from a scan into a
 *   glance.
 *
 * One component rather than two, because the hard part is not the shape: it
 * is the palette and the per-belt stripe cap, and having those in two places
 * is how a promotion ends up rendering differently in two corners of the same
 * screen. The spine is a second `appearance`, not a second source of truth.
 */
@Component({
  selector: 'app-belt-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagModule, TranslatePipe],
  templateUrl: './belt-badge.component.html',
  styleUrl: './belt-badge.component.scss',
})
export class BeltBadgeComponent {
  readonly belt = input.required<Belt>();
  /**
   * Stripe count. IBJJF max is 4 for every belt EXCEPT black, which
   * carries 1°-6° grau as 1-6 stripes (#229). Defensive clamp at 6
   * prevents bogus DB values from blowing the layout — any real-world
   * value over 6 indicates corruption upstream.
   */
  readonly stripes = input<number>(0);

  /**
   * `badge` writes the belt's name; `spine` says it in colour alone.
   *
   * A spine never carries text, so it is **redundant encoding** — the belt is
   * still readable as words elsewhere on the row. That is what keeps it
   * accessible rather than decorative, and it is why adopting it must not
   * remove the badge from the same row.
   */
  readonly appearance = input<'badge' | 'spine'>('badge');

  readonly labelKey = computed(() => BELT_KEYS[this.belt()]);

  /**
   * Stripe count clamped to the SELECTED belt's cap (#229 review).
   * Uses the same `MAX_STRIPES_PER_BELT` source the form picker reads,
   * so display stays consistent with validation: a stale `stripes=6`
   * on a non-black belt renders 4 tiles, not 6 — matching what the
   * server-side cross-field validator would reject on next write.
   */
  readonly stripeTiles = computed(() => {
    const cap = MAX_STRIPES_PER_BELT[this.belt()];
    const n = Math.max(0, Math.min(cap, Math.trunc(this.stripes())));
    return Array.from({ length: n });
  });

  /**
   * Resolves the badge colors by referencing CSS custom properties defined
   * on `:host` in the SCSS file. No hex values live in this TS file — the
   * design canon keeps hex out of component TS so that a single shared
   * presentational component doesn't leak raw colors across the app; the
   * SCSS file is where the domain-color exception is documented.
   */
  readonly style = computed<Record<string, string>>(() => {
    const belt = this.belt();
    return {
      background: `var(--budojo-belt-${belt}-bg)`,
      color: `var(--budojo-belt-${belt}-fg)`,
    };
  });

  /**
   * The spine's own paint.
   *
   * The coral belts cannot reuse `--budojo-belt-*-bg`: those gradients split
   * left-to-right, which on a 6px-wide bar would put half a colour in three
   * pixels and read as neither. A vertical bar splits along its length, the
   * way the physical belt does — so the halves are composed here from the
   * `-a` / `-b` pair, which is the same palette written once and read twice.
   */
  readonly spineStyle = computed<Record<string, string>>(() => {
    const belt = this.belt();
    return {
      background: `linear-gradient(180deg, var(--budojo-belt-${belt}-a) 0 50%, var(--budojo-belt-${belt}-b) 50% 100%)`,
      color: `var(--budojo-belt-${belt}-fg)`,
    };
  });
}
