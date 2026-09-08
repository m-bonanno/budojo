import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { Athlete } from '../../../core/services/athlete.service';
import { AthleteIdentityComponent } from './athlete-identity.component';

function makeAthlete(over: Partial<Athlete> = {}): Athlete {
  return {
    id: 7,
    first_name: 'Mario',
    last_name: 'Rossi',
    email: null,
    phone_country_code: null,
    phone_national_number: null,
    address: null,
    date_of_birth: '1990-05-15',
    belt: 'blue',
    stripes: 2,
    status: 'active',
    joined_at: '2024-01-01',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Athlete;
}

describe('AthleteIdentityComponent (#1458)', () => {
  let fixture: ComponentFixture<AthleteIdentityComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AthleteIdentityComponent],
      providers: [provideRouter([]), ...provideI18nTesting()],
    });
  });

  function render(
    inputs: Partial<{ athlete: Athlete; linkToDetail: boolean; avatarHandle: string | null }>,
  ) {
    fixture = TestBed.createComponent(AthleteIdentityComponent);
    fixture.componentRef.setInput('athlete', inputs.athlete ?? makeAthlete());
    if (inputs.linkToDetail !== undefined) {
      fixture.componentRef.setInput('linkToDetail', inputs.linkToDetail);
    }
    if (inputs.avatarHandle !== undefined) {
      fixture.componentRef.setInput('avatarHandle', inputs.avatarHandle);
    }
    fixture.detectChanges();
    return fixture;
  }

  const el = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);

  it('carries the belt as a spine, and the belt NAME with it', () => {
    // The spine is the only place a desktop row says the belt since #1443
    // removed the column, so colour alone would be the whole answer — and a
    // colour is not a name.
    render({});

    expect(el('.athlete-identity__spine')).not.toBeNull();
    expect(el('[data-cy="belt-spine"]')?.getAttribute('aria-label')).toContain('Blue');
  });

  it('makes the name a link only when the page asks for one', () => {
    // On the roster the name is the way into the athlete (#281). On the
    // attendance list the whole row is a toggle, so a link inside it would
    // be a second target with a different meaning in the same rectangle.
    render({ linkToDetail: true });
    expect(el('[data-cy="athlete-name-link"]')?.getAttribute('href')).toContain(
      '/dashboard/athletes/7',
    );

    render({ linkToDetail: false });
    expect(el('[data-cy="athlete-name-link"]')).toBeNull();
    expect(el('[data-cy="athlete-name-text"]')?.textContent?.trim()).toBe('Mario Rossi');
  });

  it('gives the avatar a target only when there is a profile to reach', () => {
    render({ avatarHandle: 'mario' });
    expect(el('[data-cy="athlete-avatar-7"]')?.getAttribute('href')).toContain(
      '/dashboard/u/mario',
    );

    // An avatar that looks clickable and is not is worse than one that never
    // claimed to be — the inert variant keeps the row's rhythm, not the
    // affordance.
    render({ avatarHandle: null });
    expect(el('[data-cy="athlete-avatar-7"]')).toBeNull();
    expect(el('[data-cy="athlete-avatar-inert-7"]')).not.toBeNull();
  });

  it('prefers the athlete’s own photo over a linked account’s avatar', () => {
    // `athlete_accounts` does not exist on the desktop build (#1357), so the
    // photo is the only picture most installs will ever have.
    render({
      athlete: makeAthlete({
        photo_url: 'https://example.test/photo.jpg',
        user_avatar_url: 'https://example.test/avatar.jpg',
      }),
    });

    expect((fixture.nativeElement as HTMLElement).innerHTML).toContain('photo.jpg');
    expect((fixture.nativeElement as HTMLElement).innerHTML).not.toContain('avatar.jpg');
  });
});
