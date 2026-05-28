'use client'

import { useState } from 'react'

export interface CarouselMediaItem {
  card_index?: number | null
  picture?: string | null
  image_url_hq?: string | null
  video_id?: string | null
  link?: string | null
}

export type CreativeMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL'

function normalizeSources(sources: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const source of sources) {
    const value = typeof source === 'string' ? source.trim() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }

  return normalized
}

export function normalizeCarouselItems(
  items?: Array<CarouselMediaItem | null | undefined> | null,
): CarouselMediaItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return []
  }

  return [...items]
    .filter((item): item is CarouselMediaItem => Boolean(item))
    .sort((left, right) => {
      const leftIndex = typeof left.card_index === 'number' ? left.card_index : Number.MAX_SAFE_INTEGER
      const rightIndex = typeof right.card_index === 'number' ? right.card_index : Number.MAX_SAFE_INTEGER
      return leftIndex - rightIndex
    })
}

export function hasCarouselItems(
  items?: Array<CarouselMediaItem | null | undefined> | null,
): boolean {
  return normalizeCarouselItems(items).length > 0
}

export function resolveCreativeType(
  baseType?: string | null,
  carouselItems?: Array<CarouselMediaItem | null | undefined> | null,
): CreativeMediaType {
  const normalizedType = (baseType || 'IMAGE').toUpperCase()

  if (normalizedType === 'VIDEO' || normalizedType === 'CAROUSEL') {
    return normalizedType
  }

  return hasCarouselItems(carouselItems) ? 'CAROUSEL' : 'IMAGE'
}

export function buildCarouselImageCandidates(
  carouselItems: Array<CarouselMediaItem | null | undefined> | null | undefined,
  activeIndex: number,
  fallbackSources: Array<string | null | undefined> = [],
): string[] {
  const items = normalizeCarouselItems(carouselItems)

  if (items.length === 0) {
    return normalizeSources(fallbackSources)
  }

  const safeIndex = ((activeIndex % items.length) + items.length) % items.length
  const activeItem = items[safeIndex]
  const otherItems = items.filter((_, index) => index !== safeIndex)

  return normalizeSources([
    activeItem?.image_url_hq,
    activeItem?.picture,
    ...otherItems.flatMap((item) => [item.image_url_hq, item.picture]),
    ...fallbackSources,
  ])
}

export function useResilientImageSource(
  sources: Array<string | null | undefined>,
): { src: string | null; onError: () => void } {
  const normalizedSources = normalizeSources(sources)
  const [sourceIndex, setSourceIndex] = useState(0)

  return {
    src: normalizedSources[sourceIndex] ?? null,
    onError: () => {
      setSourceIndex((current) => current + 1)
    },
  }
}
