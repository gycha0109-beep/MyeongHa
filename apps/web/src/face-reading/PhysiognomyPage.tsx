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

export function PhysiognomyPage({
  api,
}: {
  readonly api: PhysiognomyPageApiFE032;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
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

  return (
    <div className="phys-shell">
      <header className="phys-heading">
        <span className="phys-kicker">PHYSIOGNOMY · FACE READING</span>
        <h1>관상</h1>
        <p>사진에서 얼굴의 관측 가능한 구조를 먼저 확인합니다. 해석은 검증된 관상 체계와 연결된 뒤 별도로 제공합니다.</p>
      </header>

      <section className="phys-workspace" aria-labelledby="phys-capture-title">
        <div className="phys-preview-panel">
          <div className={'phys-preview' + (previewUrl ? ' has-image' : '')}>
            {previewUrl ? (
              <img src={previewUrl} alt="선택한 얼굴 사진 미리보기" />
            ) : (
              <div className="phys-placeholder" aria-hidden="true">
                <span className="phys-face-guide" />
                <strong>相</strong>
              </div>
            )}
            {state === 'processing' && (
              <div className="phys-processing" role="status">
                <span className="phys-spinner" aria-hidden="true" />
                <strong>얼굴을 확인하고 있습니다</strong>
                <small>사진을 안전하게 정리한 뒤 관측 영역을 확인합니다.</small>
              </div>
            )}
          </div>
          <p className="phys-privacy-note">원본 사진은 저장하지 않으며, 분석 전에 사진 메타데이터를 제거합니다.</p>
        </div>

        <div className="phys-control-panel">
          <span className="phys-step">01 · 사진 준비</span>
          <h2 id="phys-capture-title">정면에서 얼굴이 잘 보이는 사진을 사용해주세요.</h2>
          <ul className="phys-guide-list">
            <li>얼굴 전체가 프레임 안에 들어온 사진</li>
            <li>과도한 필터나 얼굴을 가리는 요소가 적은 사진</li>
            <li>JPEG · PNG · WebP, 최대 16MB</li>
          </ul>

          <input
            ref={inputRef}
            className="phys-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="user"
            onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)}
          />

          <div className="phys-actions">
            <button
              className="phys-secondary"
              type="button"
              disabled={state === 'processing'}
              onClick={() => inputRef.current?.click()}
            >
              {selected ? '다른 사진 선택' : '사진 촬영 · 선택'}
            </button>
            <button
              className="phys-primary"
              type="button"
              disabled={selected === null || state === 'processing'}
              onClick={() => void analyze()}
            >
              얼굴 확인하기 <span aria-hidden="true">→</span>
            </button>
          </div>

          {ready && (
            <div className="phys-result is-ready" role="status">
              <span className="phys-result-mark" aria-hidden="true">✓</span>
              <div>
                <strong>얼굴 관측이 완료되었습니다.</strong>
                <p>
                  확인 가능한 영역 {ready.observation.availableRegions}개
                  {ready.observation.partialRegions > 0 && (
                    <> · 부분 확인 {ready.observation.partialRegions}개</>
                  )}
                </p>
                <small>현재 단계에서는 관상 의미를 임의로 해석하지 않습니다.</small>
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

      <section className="phys-boundary" aria-label="관상 분석 안내">
        <div><span>01</span><strong>사진 안전 처리</strong><small>메타데이터 제거 · 원본 비저장</small></div>
        <div><span>02</span><strong>얼굴 구조 관측</strong><small>중립적인 측정과 영역 확인</small></div>
        <div><span>03</span><strong>관상 해석</strong><small>검증된 해석 체계 연결 후 제공</small></div>
      </section>
    </div>
  );
}
