import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { SkeletonModule } from 'primeng/skeleton';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { type AthletePromotion, AthleteService } from '../../../../core/services/athlete.service';
import { BeltBadgeComponent } from '../../../../shared/components/belt-badge/belt-badge.component';

/**
 * Owner-facing timeline of an athlete's belt + stripe promotion
 * history (post-v2.9.0). Reads `/api/v1/athletes/{id}/promotions`
 * — server writes the rows in lock-step with the
 * AthleteObserver's CommunityPost emission so the timeline stays
 * in sync with the community feed.
 *
 * Two row shapes, discriminated by `kind`:
 * - `belt`: shows the transition `<old belt> → <new belt>` (old
 *   may be null on first assignment).
 * - `stripe`: shows the transition `<n> → <m> stripes` next to a
 *   small belt badge so the visual context is preserved.
 *
 * Pagination: 20/page, prev / next buttons. Mobile-first card
 * list — date primary, transition secondary, recorder tertiary.
 *
 * **Editing (#1431 PR 1 of 2).** Each row's date can be corrected —
 * the common case where a promotion was entered after the fact and
 * carries the date it was typed, not the date it happened. The
 * transition itself (`kind`, from/to belt or stripes) and who
 * recorded it are read-only here; creating or deleting historical
 * rows is PR 2.
 */
@Component({
  selector: 'app-promotions-list',
  standalone: true,
  imports: [
    DatePipe,
    TranslatePipe,
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    SkeletonModule,
    ToastModule,
    TooltipModule,
    BeltBadgeComponent,
  ],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './promotions-list.component.html',
  styleUrl: './promotions-list.component.scss',
})
export class PromotionsListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly athleteService = inject(AthleteService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly promotions = signal<readonly AthletePromotion[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly currentPage = signal(1);
  protected readonly lastPage = signal(1);

  protected readonly editDialogOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<AthletePromotion | null>(null);
  /** A promotion can't be recorded ahead of today — same rule the server enforces. */
  protected readonly maxDate = new Date();
  protected readonly editForm = this.fb.group({
    recorded_at: this.fb.control<Date | null>(null),
  });

  private athleteId = 0;

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get('id');
    this.athleteId = raw !== null ? Number.parseInt(raw, 10) : 0;
    if (this.athleteId > 0) {
      this.load(1);
    }
  }

  protected load(page: number): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.athleteService
      .promotions(this.athleteId, page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.promotions.set(resp.data);
          this.currentPage.set(resp.meta.current_page);
          this.lastPage.set(resp.meta.last_page);
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set(true);
          this.loading.set(false);
        },
      });
  }

  protected nextPage(): void {
    if (this.currentPage() < this.lastPage()) this.load(this.currentPage() + 1);
  }

  protected previousPage(): void {
    if (this.currentPage() > 1) this.load(this.currentPage() - 1);
  }

  /** Seeded from the row's current date so the picker opens where the owner is correcting, not on today. */
  protected openEditDialog(promotion: AthletePromotion): void {
    this.editing.set(promotion);
    this.editForm.reset({ recorded_at: new Date(promotion.recorded_at) });
    this.editDialogOpen.set(true);
  }

  protected confirmEdit(): void {
    const target = this.editing();
    const recordedAt = this.editForm.controls.recorded_at.value;
    if (target === null || recordedAt === null || this.saving()) return;

    this.saving.set(true);
    this.athleteService
      .updatePromotionRecordedAt(this.athleteId, target.id, toIsoDate(recordedAt))
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.editDialogOpen.set(false);
          // Reload rather than patch the row in place: the edit can move a
          // row across the `recorded_at DESC` ordering, possibly off this
          // page entirely — the server's fresh sort is the source of truth.
          this.load(this.currentPage());
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('athletes.detail.promotions.toast.updatedSummary'),
            detail: this.translate.instant('athletes.detail.promotions.toast.updatedDetail'),
            life: 3000,
          });
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('athletes.detail.promotions.toast.errorSummary'),
            detail: this.translate.instant('athletes.detail.promotions.toast.errorGeneric'),
            life: 4000,
          });
        },
      });
  }
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
