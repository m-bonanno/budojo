<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Models\Athlete;
use App\Models\AthletePromotion;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Validation\Validator;

/**
 * Cross-field rule for backfilling promotion history (#1431 PR 2 of 2).
 *
 * The issue's own open question: what happens when a backfilled promotion
 * contradicts the athlete's existing history around it — a 2019 blue-belt
 * row inserted after an existing black-belt row, say. The product decision
 * (recorded explicitly, not assumed): REFUSE, with a specific error naming
 * the row it disagrees with. Silently allowing it would let the timeline
 * contradict itself; a soft warning would let an owner click through a
 * contradiction without noticing.
 *
 * **Scope, deliberately narrow**: each kind (`belt`, `stripe`) is checked
 * against its OWN same-kind neighbours only — a stripe row is never
 * cross-checked against belt rows, even though a real belt promotion
 * resets stripes to 0. Modelling that interaction would mean either
 * auto-inserting a companion stripe-reset row on every belt backfill (not
 * what the owner asked for) or rejecting historically-accurate stripe
 * entries whenever an unrelated belt row happens to sit between them.
 * Neither is what "add a past promotion" should feel like for someone
 * transcribing an incomplete paper register.
 *
 * A row with NO same-kind predecessor (or successor) is unconstrained on
 * that side — that is the legitimate "earliest/latest known event of this
 * kind" case, most commonly an athlete who joined already holding a belt
 * or stripe count Budojo never generated a row for.
 */
trait ValidatesPromotionChainConsistency
{
    protected function validatePromotionChainConsistency(Validator $validator): void
    {
        $kind = $this->input('kind');
        if (! \in_array($kind, ['belt', 'stripe'], true)) {
            return; // the shape rule on `kind` already failed separately
        }

        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            return;
        }

        $recordedAt = $this->date('recorded_at');
        if ($recordedAt === null) {
            return; // the shape rule on `recorded_at` already failed separately
        }

        $kind === 'belt'
            ? $this->validateBeltChain($validator, $athlete, $recordedAt)
            : $this->validateStripeChain($validator, $athlete, $recordedAt);
    }

    private function validateBeltChain(Validator $validator, Athlete $athlete, CarbonInterface $recordedAt): void
    {
        $fromBelt = $this->input('from_belt');
        $toBelt = $this->input('to_belt');

        $previous = $this->neighbour($athlete, 'belt', $recordedAt, earlier: true);
        if ($previous !== null && $fromBelt !== $previous->to_belt?->value) {
            $validator->errors()->add(
                'from_belt',
                "Doesn't match the belt after the previous promotion on {$previous->recorded_at->toDateString()} ({$previous->to_belt?->value}).",
            );
        }

        $next = $this->neighbour($athlete, 'belt', $recordedAt, earlier: false);
        if ($next !== null && $toBelt !== $next->from_belt?->value) {
            $validator->errors()->add(
                'to_belt',
                "Doesn't match the belt before the next promotion on {$next->recorded_at->toDateString()} ({$next->from_belt?->value}).",
            );
        }
    }

    private function validateStripeChain(Validator $validator, Athlete $athlete, CarbonInterface $recordedAt): void
    {
        // `is_numeric` narrows `mixed` before the cast (PHPStan level 9);
        // a non-numeric value already fails the shape rule separately, so
        // falling back to null here just skips this cross-check rather
        // than duplicating that error.
        $fromStripesRaw = $this->input('from_stripes');
        $fromStripes = is_numeric($fromStripesRaw) ? (int) $fromStripesRaw : null;
        $toStripesRaw = $this->input('to_stripes');
        $toStripes = is_numeric($toStripesRaw) ? (int) $toStripesRaw : null;

        $previous = $this->neighbour($athlete, 'stripe', $recordedAt, earlier: true);
        if ($previous !== null && $fromStripes !== $previous->to_stripes) {
            $validator->errors()->add(
                'from_stripes',
                "Doesn't match the stripe count after the previous promotion on {$previous->recorded_at->toDateString()} ({$previous->to_stripes}).",
            );
        }

        $next = $this->neighbour($athlete, 'stripe', $recordedAt, earlier: false);
        if ($next !== null && $toStripes !== $next->from_stripes) {
            $validator->errors()->add(
                'to_stripes',
                "Doesn't match the stripe count before the next promotion on {$next->recorded_at->toDateString()} ({$next->from_stripes}).",
            );
        }
    }

    /**
     * The nearest same-kind row on one side of `$recordedAt`. A same-day
     * existing row counts as the earlier one — the new row is treated as
     * appended after whatever already happened that day, which is the
     * only ordering a date-only backfill can express.
     */
    private function neighbour(Athlete $athlete, string $kind, CarbonInterface $recordedAt, bool $earlier): ?AthletePromotion
    {
        $query = $athlete->promotions()->where('kind', $kind);

        return $earlier
            ? $query->where('recorded_at', '<=', $recordedAt)->orderByDesc('recorded_at')->orderByDesc('id')->first()
            : $query->where('recorded_at', '>', $recordedAt)->orderBy('recorded_at')->orderBy('id')->first();
    }
}
