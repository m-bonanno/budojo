<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Promotion\UpdateAthletePromotionRecordedAtAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Promotion\UpdateAthletePromotionRequest;
use App\Http\Resources\AthletePromotionResource;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Owner-facing read + edit of an athlete's belt + stripe promotion
 * history (post-v2.9.0 feature: "voglio ricordarmi quando ho dato la
 * striscia a chi"; editing added for #1431: "devo poter riscrivere la
 * storia di un atleta"). The athlete detail page renders the result
 * as a date-ordered timeline under the belt-and-status header.
 *
 * Authorization: same shape as the rest of the academy-scoped athlete
 * surface — caller must be the owner of the athlete's academy.
 * Athletes can read their OWN promotion history; that path lives
 * under `/me/promotions` (#TBD) and isn't this controller's concern.
 */
class AthletePromotionController extends Controller
{
    public function __construct(
        private readonly UpdateAthletePromotionRecordedAtAction $updateRecordedAt,
    ) {
    }

    public function index(Request $request, Athlete $athlete): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->activeAcademyId() === null || $athlete->academy_id !== $user->activeAcademyId()) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $promotions = $athlete->promotions()->with('recordedBy:id,first_name,last_name')->paginate(20);

        return AthletePromotionResource::collection($promotions);
    }

    /**
     * #1431 PR 1 of 2 — corrects `recorded_at` on an existing row. The
     * belt/stripe transition it describes, and who recorded it, are not
     * editable here; see `UpdateAthletePromotionRecordedAtAction` for why
     * this can't drag the athlete's current belt around.
     */
    public function update(UpdateAthletePromotionRequest $request, Athlete $athlete, AthletePromotion $promotion): JsonResponse
    {
        // Mirrors CarnetController::update's double-check: the FormRequest
        // authorizes against the athlete's academy, but a caller could
        // still pair a promotion id from a DIFFERENT athlete they don't
        // have with one they do — this confirms the promotion actually
        // belongs to the athlete in the path.
        if ($promotion->athlete_id !== $athlete->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $recordedAt = CarbonImmutable::make($request->date('recorded_at'));
        \assert($recordedAt instanceof CarbonImmutable); // `required` + `date_format` in the request

        $promotion = $this->updateRecordedAt->execute($promotion, $recordedAt);

        return response()->json([
            'data' => new AthletePromotionResource($promotion->load('recordedBy:id,first_name,last_name')),
        ]);
    }
}
