<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePromotion;

/**
 * Feature tests for `DELETE /api/v1/athletes/{athlete}/promotions/{promotion}`
 * — undoes a row entered by mistake (#1431 PR 2 of 2). A hard delete: this
 * is a data-entry correction, not a real-world event being reversed, so
 * there is no restore concept here (unlike athletes/carnets).
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create();
    $this->athlete = $athlete;
});

it('deletes a promotion row', function (): void {
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/promotions/{$promotion->id}")
        ->assertNoContent();

    expect(AthletePromotion::count())->toBe(0);
});

it('rejects a promotion that belongs to a different athlete', function (): void {
    /** @var Athlete $other */
    $other = Athlete::factory()->for($this->academy)->create();
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $other->id,
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/promotions/{$promotion->id}")
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);

    expect(AthletePromotion::count())->toBe(1);
});

it('rejects cross-academy deletes with 403', function (): void {
    $otherOwner = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($otherOwner->academy)->create();
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $athlete->id,
        'recorded_by_user_id' => $otherOwner->id,
    ]);

    $this->actingAs($this->owner)
        ->deleteJson("/api/v1/athletes/{$athlete->id}/promotions/{$promotion->id}")
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);
});

it('rejects unauthenticated callers with 401', function (): void {
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->deleteJson("/api/v1/athletes/{$this->athlete->id}/promotions/{$promotion->id}")
        ->assertStatus(401);
});

it('404s for a promotion id that does not exist', function (): void {
    $this->actingAs($this->owner)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/promotions/999999")
        ->assertNotFound();
});
