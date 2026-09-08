<?php

declare(strict_types=1);

namespace App\Actions\Promotion;

use App\Models\AthletePromotion;
use Carbon\CarbonImmutable;

class UpdateAthletePromotionRecordedAtAction
{
    /**
     * Corrects when a promotion actually happened, not when it was typed
     * into Budojo (#1431 PR 1 of 2) — the common case an academy hits on
     * adoption, where every row is dated "when it was entered" rather than
     * "when it happened".
     *
     * Only `recorded_at` moves. `kind`, the belt/stripe transition, and
     * `recorded_by_user_id` describe the promotion event itself and stay
     * put. This writes straight to the `AthletePromotion` row and never
     * touches `Athlete::$belt` / `Athlete::$stripes`, so the
     * `AthleteObserver` — which only reacts to athlete changes — never
     * fires here: no new promotion row spawns, and the athlete's current
     * belt cannot be dragged around by editing history.
     */
    public function execute(AthletePromotion $promotion, CarbonImmutable $recordedAt): AthletePromotion
    {
        $promotion->update(['recorded_at' => $recordedAt]);

        $refreshed = $promotion->fresh();
        \assert($refreshed instanceof AthletePromotion); // the row was updated one statement ago

        return $refreshed;
    }
}
