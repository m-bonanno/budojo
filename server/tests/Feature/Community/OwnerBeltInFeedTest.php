<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Models\Academy;
use App\Models\CommunityPost;
use App\Models\PostComment;
use Laravel\Sanctum\Sanctum;

/**
 * The owner's belt under their own posts (#747).
 *
 * The last unticked line on that epic's acceptance list, and the one it
 * expected to get for free: *"the community feed already resolves the user's
 * belt via `Athlete` rows under `user_id`, so a linked owner's posts will
 * auto-show the belt with **zero** changes to the community render path."*
 *
 * The reasoning was right and the feature does work. But "it follows from the
 * design" is how a box stays unticked for four months, and it is not the same
 * claim as "somebody watched it happen". These tests are that.
 *
 * **A warning about the shape of these assertions**, paid for while writing
 * them: the first draft read `data.0.author.belt`, and the resource emits
 * `created_by`. The two tests expecting a belt failed honestly — but the two
 * expecting `null` **passed**, because a path that does not exist is null too.
 * Half this file was green against a typo. When an assertion's expected value
 * is null, it proves nothing until something adjacent proves the path is real;
 * here the positive cases do that job for the negative ones.
 */
function ownerWhoTrains(): App\Models\User
{
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);
    // Through the real endpoint rather than a factory: the point is that the
    // enrolment flow produces a row the feed can read, not that a hand-made
    // row would be readable.
    test()->postJson('/api/v1/me/athlete')->assertCreated();

    return $owner->fresh();
}

it('shows the belt under a post the owner wrote, once they train there', function (): void {
    $owner = ownerWhoTrains();
    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    CommunityPost::factory()->for($academy)->create(['created_by_user_id' => $owner->id]);

    $response = $this->actingAs($owner)->getJson('/api/v1/community/feed')->assertOk();

    // White, because that is what enrolment starts everyone on — the value
    // matters less than the field being present at all.
    expect($response->json('data.0.created_by.belt'))->toBe(Belt::White->value);
});

it('follows the owner up the ranks', function (): void {
    $owner = ownerWhoTrains();
    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    $academy->athletes()->where('user_id', $owner->id)->update(['belt' => Belt::Black->value]);
    CommunityPost::factory()->for($academy)->create(['created_by_user_id' => $owner->id]);

    // The head coach of a small academy is usually the highest belt in it.
    // Reading the linked row rather than a copy is what makes a promotion
    // show up here without anyone thinking about the feed.
    expect($this->actingAs($owner)->getJson('/api/v1/community/feed')->json('data.0.created_by.belt'))
        ->toBe(Belt::Black->value);
});

it('leaves an owner who does not train without one', function (): void {
    $owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    CommunityPost::factory()->for($academy)->create(['created_by_user_id' => $owner->id]);

    // The opt-in half of the same rule. Most owners are managers, spouses or
    // co-founders who never step on the mat, and inventing a white belt for
    // them would be worse than the absence — the SPA has an owner variant of
    // the flair for exactly this.
    expect($this->actingAs($owner)->getJson('/api/v1/community/feed')->json('data.0.created_by.belt'))
        ->toBeNull();
});

it('takes the belt away again when the owner stops training', function (): void {
    $owner = ownerWhoTrains();
    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    CommunityPost::factory()->for($academy)->create(['created_by_user_id' => $owner->id]);

    $this->actingAs($owner)->deleteJson('/api/v1/me/athlete')->assertNoContent();

    // Leaving soft-deletes the row so attendance and promotions survive a
    // re-enrolment. The feed must not read a soft-deleted row anyway: someone
    // who has stopped training should stop being shown as a practitioner.
    expect($this->actingAs($owner)->getJson('/api/v1/community/feed')->json('data.0.created_by.belt'))
        ->toBeNull();
});

it('shows it on comments as well as posts', function (): void {
    $owner = ownerWhoTrains();
    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($academy)->create();
    PostComment::factory()->for($post, 'post')->for($owner)->create();

    // A separate resource with its own copy of the same lookup, so it can
    // drift from the feed independently — and a belt that appears on posts
    // but not on the same person's replies reads as a bug either way round.
    expect($this->actingAs($owner)->getJson("/api/v1/community/posts/{$post->id}/comments")->json('data.0.created_by.belt'))
        ->toBe(Belt::White->value);
});
