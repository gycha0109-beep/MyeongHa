import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PhysiognomyPageApiFE032,
  PhysiognomyPageAnalysisResultFE032,
} from './page-api-fe032.js';

type PageState = 'idle' | 'selected' | 'processing' | 'ready' | 'rejected';

const reasonCopy: Record<
  Extract<PhysiognomyPageAnalysisResultFE032, { status: 'rejected' }>['reason'],
  string
> = {
  image: '사진을 확인할 수 없습니다. JPEG, PNG 또는 WebP 사진을 다시 선택해주세요.',
  face: '얼굴을 확인하지 못했습니다. 정면에서 얼굴이 선명하게 보이는 사진을 사용해주세요.',
  engine: '얼굴 확인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.',
  lifecycle: '분석을 안전하게 마무리하지 못했습니다. 결과를 폐기했습니다. 다시 시도해주세요.',
  unknown: '사진을 확인하지 못했습니다. 다른 사진으로 다시 시도해주세요.',
};

const stateCopy: Record<
  PageState,
  Readonly<{ step: string; title: string; description: string }>
> = {
  idle: {
    step: '01 · 사진 준비',
    title: '정면에서 얼굴이 잘 보이는 사진을 준비해주세요.',
    description: '촬영하거나 앨범에서 사진을 선택하면 얼굴 구조 확인을 시작할 수 있습니다.',
  },
  selected: {
    step: '01 · 사진 확인',
    title: '이 사진으로 얼굴 구조를 확인할까요?',
    description: '선택한 사진을 다시 확인한 뒤 분석을 시작해주세요.',
  },
  processing: {
    step: '02 · 얼굴 구조 확인',
    title: '얼굴의 관측 가능한 구조를 확인하고 있습니다.',
    description: '사진을 안전하게 정리한 뒤 얼굴 영역을 순서대로 확인합니다.',
  },
  ready: {
    step: '02 · 얼굴 확인 완료',
    title: '관상 풀이로 이어갈 얼굴 구조가 준비되었습니다.',
    description: '현재 단계에서는 관측 결과만 확인하며 관상 의미를 임의로 만들지 않습니다.',
  },
  rejected: {
    step: '01 · 사진 다시 준비',
    title: '다른 사진으로 다시 시도해주세요.',
    description: '정면에서 얼굴 전체가 선명하게 보이는 사진일수록 안정적으로 확인할 수 있습니다.',
  },
};

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

export function PhysiognomyPage({
  api,
}: {
  readonly api: PhysiognomyPageApiFE032;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PageState>('idle');
  const [selected, setSelected] = useState<File | null>(null);
  const [result, setResult] =
    useState<PhysiognomyPageAnalysisResultFE032 | null>(null);

  const previewUrl = useMemo(
    () => selected === null ? null : URL.createObjectURL(selected),
    [selected],
  );

  useEffect(() => {
    return () => {
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function chooseFile(file: File | null) {
    setResult(null);
    if (file === null) {
      setSelected(null);
      setState('idle');
      return;
    }
    setSelected(file);
    setState('selected');
  }

  async function analyze() {
    if (selected === null || state === 'processing') return;
    setState('processing');
    setResult(null);
    try {
      const next = await api.analyze(selected);
      setResult(next);
      setState(next.status === 'ready' ? 'ready' : 'rejected');
    } catch {
      setResult({
        schemaVersion: 'myeongha-physiognomy-page-analysis-v1',
        contractVersion: api.contractVersion,
        status: 'rejected',
        reason: 'unknown',
      });
      setState('rejected');
    }
  }

  const ready = result?.status === 'ready' ? result : null;
  const rejected = result?.status === 'rejected' ? result : null;
  const copy = stateCopy[state];

  return (
    <div className={`phys-shell phys-state-${state}`}>
      <header className="phys-hero">
        <div className="phys-hero-copy">
          <span className="phys-kicker">FACE READING</span>
          <h1>관상</h1>
          <strong>얼굴에 드러난 구조를 읽습니다.</strong>
          <p>
            한 장의 사진으로 얼굴의 형태와 균형을 살펴보고,
            검증된 관상 풀이로 이어갈 준비를 합니다.
          </p>
        </div>
        <div className="phys-hero-ornament" aria-hidden="true">
          <span className="phys-orbit phys-orbit-one" />
          <span className="phys-orbit phys-orbit-two" />
          <span className="phys-orbit phys-orbit-three" />
          <b>相</b>
        </div>
      </header>

      <section className="phys-workspace" aria-labelledby="phys-capture-title">
        <div className="phys-preview-panel">
          <div className={'phys-preview' + (previewUrl ? ' has-image' : '')}>
            {previewUrl ? (
              <img src={previewUrl} alt="선택한 얼굴 사진 미리보기" />
            ) : (
              <div className="phys-placeholder" aria-hidden="true">
                <span className="phys-face-guide" />
                <span className="phys-silhouette" />
                <strong>相</strong>
                <small>정면 사진을 이 안에 맞춰주세요</small>
              </div>
            )}

            {previewUrl && state !== 'processing' && (
              <div className="phys-photo-corners" aria-hidden="true">
                <i /><i /><i /><i />
              </div>
            )}

            {state === 'processing' && (
              <div className="phys-processing" role="status" aria-live="polite">
                <div className="phys-analysis-guide" aria-hidden="true">
                  <span className="phys-analysis-line phys-analysis-line-top" />
                  <span className="phys-analysis-line phys-analysis-line-mid" />
                  <span className="phys-analysis-line phys-analysis-line-bottom" />
                  <span className="phys-analysis-axis" />
                  <span className="phys-scan-beam" />
                </div>
                <span className="phys-spinner" aria-hidden="true" />
                <strong>얼굴 구조를 확인하고 있습니다.</strong>
                <small>눈 · 중안부 · 입 · 하안부 영역을 확인합니다.</small>
              </div>
            )}

            {ready && (
              <div className="phys-preview-complete" aria-hidden="true">
                <span>✓</span>
                얼굴 확인 완료
              </div>
            )}
          </div>

          <div className="phys-preview-meta">
            <span><b aria-hidden="true">◇</b> 원본 사진은 저장하지 않습니다.</span>
            <span>JPEG · PNG · WebP</span>
          </div>
        </div>

        <div className="phys-control-panel">
          <span className="phys-step">{copy.step}</span>
          <h2 id="phys-capture-title">{copy.title}</h2>
          <p className="phys-control-description">{copy.description}</p>

          {(state === 'idle' || state === 'selected') && (
            <ul className="phys-guide-list">
              <li><span>✓</span> 얼굴 전체가 프레임 안에 들어온 사진</li>
              <li><span>✓</span> 정면에 가깝고 흔들림이 적은 사진</li>
              <li><span>✓</span> 과도한 필터나 얼굴을 가리는 요소가 적은 사진</li>
              <li><span>✓</span> 밝기가 충분하고 얼굴 윤곽이 보이는 사진</li>
            </ul>
          )}

          {selected && state !== 'processing' && (
            <div className="phys-file-card">
              <span className="phys-file-mark" aria-hidden="true">▧</span>
              <div>
                <strong>{selected.name || '선택한 사진'}</strong>
                <small>{formatFileSize(selected.size)} · 분석 전 원본 비저장</small>
              </div>
              <span className="phys-file-state">
                {ready ? '확인 완료' : rejected ? '재선택 가능' : '준비됨'}
              </span>
            </div>
          )}

          <input
            ref={cameraInputRef}
            className="phys-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="user"
            onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)}
          />
          <input
            ref={galleryInputRef}
            className="phys-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)}
          />

          <div className="phys-actions">
            <button
              className="phys-secondary"
              type="button"
              disabled={state === 'processing'}
              onClick={() => cameraInputRef.current?.click()}
            >
              <span aria-hidden="true">▣</span> 사진 촬영
            </button>
            <button
              className="phys-secondary"
              type="button"
              disabled={state === 'processing'}
              onClick={() => galleryInputRef.current?.click()}
            >
              <span aria-hidden="true">▧</span> 사진 선택
            </button>
            <button
              className="phys-primary"
              type="button"
              disabled={selected === null || state === 'processing'}
              onClick={() => void analyze()}
            >
              {ready ? '다시 확인하기' : '얼굴 확인하기'} <span aria-hidden="true">→</span>
            </button>
          </div>

          {ready && (
            <div className="phys-result is-ready" role="status">
              <span className="phys-result-mark" aria-hidden="true">✓</span>
              <div>
                <strong>얼굴 확인이 완료되었습니다.</strong>
                <p>
                  전체 {ready.observation.totalRegions}개 영역 중
                  {' '}{ready.observation.availableRegions}개 영역을 확인했습니다.
                  {ready.observation.partialRegions > 0 && (
                    <> 일부 확인 영역은 {ready.observation.partialRegions}개입니다.</>
                  )}
                </p>
                <div className="phys-result-meter" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.round(
                        (ready.observation.availableRegions /
                          Math.max(ready.observation.totalRegions, 1)) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <small>관상 해석 단계는 검증된 해석 체계가 연결된 뒤 이어집니다.</small>
              </div>
            </div>
          )}

          {rejected && (
            <div className="phys-result is-rejected" role="alert">
              <span className="phys-result-mark" aria-hidden="true">!</span>
              <div>
                <strong>사진을 다시 확인해주세요.</strong>
                <p>{reasonCopy[rejected.reason]}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="phys-flow" aria-labelledby="phys-flow-title">
        <div className="phys-flow-heading">
          <span className="phys-kicker">HOW IT WORKS</span>
          <h2 id="phys-flow-title">관상은 이렇게 진행됩니다.</h2>
          <p>사진은 안전하게 처리하고, 얼굴 구조를 확인한 뒤 관상 풀이로 이어갑니다.</p>
        </div>
        <div className="phys-boundary" aria-label="관상 분석 안내">
          <div>
            <span className="phys-boundary-number">01</span>
            <b className="phys-boundary-icon" aria-hidden="true">▣</b>
            <strong>사진 안전 처리</strong>
            <small>메타데이터를 제거하고 원본 이미지를 저장하지 않습니다.</small>
          </div>
          <div>
            <span className="phys-boundary-number">02</span>
            <b className="phys-boundary-icon" aria-hidden="true">◎</b>
            <strong>얼굴 구조 확인</strong>
            <small>얼굴의 관측 가능한 영역과 구조를 중립적으로 확인합니다.</small>
          </div>
          <div>
            <span className="phys-boundary-number">03</span>
            <b className="phys-boundary-icon" aria-hidden="true">▤</b>
            <strong>관상 풀이</strong>
            <small>검증된 관상 기준과 연결된 뒤 결과를 하나의 풀이로 구성합니다.</small>
          </div>
        </div>
      </section>
    </div>
  );
}
