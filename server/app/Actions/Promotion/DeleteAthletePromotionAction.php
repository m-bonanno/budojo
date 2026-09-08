<?php

declare(strict_types=1);

namespace App\Actions\Promotion;

use App\Models\AthletePromotion;

class DeleteAthletePromotionAction
{
    /**
     * Undoes a row entered by mistake (#1431 PR 2 of 2). A hard delete:
     * unlike a carnet sale or an athlete row, a promotion row records
     * nothing the rest of the system depends on — no ledger to
     * reconcile, no cascade — so there is no restore concept here.
     */
    public function execute(AthletePromotion $promotion): void
    {
        $promotion->delete();
    }
}
