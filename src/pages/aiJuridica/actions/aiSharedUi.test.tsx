import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiAttachmentInput } from './aiSharedUi'

function pdfFile(name = 'peticao.pdf', bytes = 1024) {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' })
}

// userEvent.upload() respeita o atributo "accept" do input e nem dispara o
// evento de change pra um tipo fora dele — reflete o seletor nativo do SO,
// mas esconde o comportamento da nossa validação de defesa-em-profundidade
// (o servidor nunca confia só nisso; drag-and-drop também ignora "accept").
// Pra testar essa camada, simula a seleção direto via fireEvent.
function selectFileBypassingAccept(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

describe('AiAttachmentInput', () => {
  it('mostra o input de arquivo quando nenhum anexo foi selecionado', () => {
    render(<AiAttachmentInput value={null} onChange={vi.fn()} />)
    expect(screen.getByText(/Anexar PDF ou imagem/)).toBeInTheDocument()
  })

  it('converte o arquivo selecionado e chama onChange com o anexo', async () => {
    const onChange = vi.fn()
    render(<AiAttachmentInput value={null} onChange={onChange} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, pdfFile())

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const [attachment] = onChange.mock.calls[0]
    expect(attachment.filename).toBe('peticao.pdf')
    expect(attachment.mime_type).toBe('application/pdf')
    expect(attachment.data_base64.length).toBeGreaterThan(0)
  })

  it('rejeita tipo de arquivo não suportado sem chamar onChange', async () => {
    const onChange = vi.fn()
    render(<AiAttachmentInput value={null} onChange={onChange} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const docFile = new File(['x'], 'contrato.doc', { type: 'application/msword' })
    selectFileBypassingAccept(input, docFile)

    expect(await screen.findByText('Tipo de arquivo não suportado. Anexe um PDF, JPEG ou PNG.')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejeita arquivo acima de 15MB sem chamar onChange', async () => {
    const onChange = vi.fn()
    render(<AiAttachmentInput value={null} onChange={onChange} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const bigFile = pdfFile('grande.pdf', 15 * 1024 * 1024 + 1)
    await userEvent.upload(input, bigFile)

    expect(await screen.findByText('Arquivo muito grande (máx. 15MB).')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('mostra o nome do arquivo anexado e permite remover', async () => {
    const onChange = vi.fn()
    render(<AiAttachmentInput value={{ mime_type: 'application/pdf', data_base64: 'YWJj', filename: 'peticao.pdf' }} onChange={onChange} />)

    expect(screen.getByText('peticao.pdf')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
