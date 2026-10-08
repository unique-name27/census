import { describe, expect, it } from 'vitest'
import { CHIP_STAGES } from '../schema'
import {
  proposeEngineering,
  proposeStage,
  savedEngineering,
  savedStageKey,
  stageFromText,
  stageOrder,
} from './stages'

describe('chip development stages', () => {
  it('has nine lifecycle stages, then the two across it', () => {
    expect(CHIP_STAGES.map((s) => s.key)).toEqual([
      'architecture',
      'rtl',
      'ams',
      'verification',
      'dft',
      'physical',
      'signoff',
      'postSilicon',
      'productTest',
      'software',
      'shared',
    ])
    expect(CHIP_STAGES.filter((s) => s.acrossLifecycle).map((s) => s.key)).toEqual(['software', 'shared'])
    expect(CHIP_STAGES.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(stageOrder('dft')).toBe(5)
  })

  it.each([
    ['SoC Architect', 'architecture'],
    ['Performance Modeling Engineer', 'architecture'],
    ['Analog Layout Engineer', 'ams'],
    ['Mixed-Signal Design', 'ams'],
    ['SerDes Design Engineer', 'ams'],
    ['RF Design', 'ams'],
    ['Physical Verification Engineer', 'signoff'],
    ['Static Timing Analysis Engineer', 'signoff'],
    ['STA Engineer', 'signoff'],
    ['Package Design Engineer', 'signoff'],
    ['Signal integrity', 'signoff'],
    ['Formal Verification Engineer', 'verification'],
    ['Emulation and prototyping', 'verification'],
    ['Design Verification', 'verification'],
    ['Memory BIST Engineer', 'dft'],
    ['DFT', 'dft'],
    ['Physical Design', 'physical'],
    ['Place and route', 'physical'],
    ['Design RTL', 'rtl'],
    ['ASIC Design Engineer', 'rtl'],
    ['Digital Design', 'rtl'],
    ['Post-Silicon Validation', 'postSilicon'],
    ['Systems Validation', 'postSilicon'],
    ['Board Design Engineer', 'postSilicon'],
    ['Hardware Engineering', 'postSilicon'],
    ['Product Engineering', 'productTest'],
    ['Test Engineering', 'productTest'],
    ['Yield Engineer', 'productTest'],
    ['Quality & Reliability', 'productTest'],
    ['Firmware', 'software'],
    ['Compiler and Software Tools Engineer', 'software'],
    ['EDA & CAD Infrastructure', 'shared'],
    ['Engineering leadership', 'shared'],
  ])('proposes %s as %s', (text, stage) => {
    expect(stageFromText(text)).toBe(stage)
  })

  it('matches whole words only: "sta" never inside staff or status', () => {
    expect(stageFromText('Staff Accountant')).toBe(null)
    expect(stageFromText('Status reporting')).toBe(null)
    expect(stageFromText('Rate analyst')).toBe(null)
    expect(stageFromText('Boardroom')).toBe(null)
  })

  it('tries the function name, then its commonest title; nothing matched is Not mapped', () => {
    expect(proposeStage('Silicon Methods', 'Formal Verification Engineer')).toBe('verification')
    expect(proposeStage('Analog design', 'Analog Layout Engineer')).toBe('ams')
    expect(proposeStage('Supply Chain', 'Supply Chain Planner')).toBe(null)
    expect(proposeStage('Sales')).toBe(null)
  })

  it('reads a saved stage as its label, key or a stage order saved before it was a choice', () => {
    expect(savedStageKey('RTL design')).toBe('rtl')
    expect(savedStageKey('rtl design')).toBe('rtl')
    expect(savedStageKey('postSilicon')).toBe('postSilicon')
    expect(savedStageKey(7)).toBe('signoff')
    expect(savedStageKey('2')).toBe('rtl')
    expect(savedStageKey(12)).toBe(null)
    expect(savedStageKey('')).toBe(null)
    expect(savedStageKey(null)).toBe(null)
    expect(savedStageKey('Fabrication')).toBe(null)
  })

  it('proposes engineering from a family name, and reads a saved Yes or No', () => {
    expect(proposeEngineering('Silicon Engineering')).toBe(true)
    expect(proposeEngineering('Systems & Software Engineering')).toBe(true)
    expect(proposeEngineering('Product & Test Operations')).toBe(false)
    expect(proposeEngineering('Corporate')).toBe(false)
    expect(savedEngineering('Yes')).toBe(true)
    expect(savedEngineering('no')).toBe(false)
    expect(savedEngineering('')).toBe(null)
  })
})
