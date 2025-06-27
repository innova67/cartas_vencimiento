// components/PDFGeneration/LetterGenerator.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
	FileText,
	Download,
	Eye,
	AlertTriangle,
	CheckCircle,
	X,
	Edit3,
	Save,
	RefreshCw,
	Package,
	Printer,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProcessedInsuranceRecord } from "@/types/insurance";
import { LetterData, GeneratedLetter, PDFGenerationResult } from "@/types/pdf";
import {
	groupRecordsForLetters,
	validateRecordForPDF,
	generateFileName,
	formatUSD,
	formatCurrency,
} from "@/utils/pdfutils";
import { pdf } from "@react-pdf/renderer";
import { HealthTemplate } from "./HealthTemplate";
import { GeneralTemplate } from "./GeneralTemplate";
import JSZip from "jszip";

interface LetterGeneratorProps {
	selectedRecords: ProcessedInsuranceRecord[];
	onClose: () => void;
	onGenerated?: (result: PDFGenerationResult) => void;
}

// Componente para input numérico validado
interface NumericInputProps {
	value: number | string;
	onChange: (value: number) => void;
	placeholder?: string;
	className?: string;
	label?: string;
}

function NumericInput({ value, onChange, placeholder, className, label }: NumericInputProps) {
	const [displayValue, setDisplayValue] = useState(String(value || ""));

	useEffect(() => {
		setDisplayValue(String(value || ""));
	}, [value]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const input = e.target.value;
		// Permitir solo números y punto decimal
		const numericValue = input.replace(/[^0-9.]/g, "");
		// Evitar múltiples puntos decimales
		const parts = numericValue.split(".");
		const cleanValue = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : numericValue;

		setDisplayValue(cleanValue);
		// Convertir a número y llamar onChange
		const numValue = parseFloat(cleanValue);
		if (!isNaN(numValue) && numValue >= 0) {
			onChange(numValue);
		} else if (cleanValue === "" || cleanValue === ".") {
			onChange(0);
		}
	};

	const handleBlur = () => {
		// Formatear el valor cuando se pierde el foco
		const numValue = parseFloat(displayValue);
		if (!isNaN(numValue)) {
			setDisplayValue(numValue.toString());
		} else {
			setDisplayValue("");
			onChange(0);
		}
	};

	return (
		<div>
			{label && <label className="text-xs text-gray-600 block mb-1">{label}</label>}
			<Input
				type="text"
				value={displayValue}
				onChange={handleChange}
				onBlur={handleBlur}
				placeholder={placeholder}
				className={className}
			/>
		</div>
	);
}

// Componente para textarea de condiciones específicas
interface ConditionsTextareaProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	label?: string;
}

function ConditionsTextarea({ value, onChange, placeholder, label }: ConditionsTextareaProps) {
	return (
		<div>
			{label && <label className="text-xs text-gray-600 block mb-1">{label}</label>}
			<textarea
				value={value || ""}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="w-full p-2 text-xs border border-gray-300 rounded-md resize-none h-16 focus:ring-2 focus:ring-patria-blue focus:border-transparent"
				rows={3}
			/>
		</div>
	);
}

export default function LetterGenerator({ selectedRecords, onClose, onGenerated }: LetterGeneratorProps) {
	const [letters, setLetters] = useState<LetterData[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const [editingLetter, setEditingLetter] = useState<string | null>(null);
	const [previewLetter, setPreviewLetter] = useState<string | null>(null);
	const [generationResult, setGenerationResult] = useState<PDFGenerationResult | null>(null);

	// Preparar cartas basándose en los registros seleccionados
	const preparedLetters = useMemo(() => {
		const validRecords: ProcessedInsuranceRecord[] = [];
		const validationErrors: string[] = [];

		selectedRecords.forEach((record, index) => {
			const validation = validateRecordForPDF(record);
			if (validation.valid) {
				validRecords.push(record);
			} else {
				validationErrors.push(`Registro ${index + 1} (${record.asegurado}): ${validation.errors.join(", ")}`);
			}
		});

		const groupedLetters = groupRecordsForLetters(validRecords);
		return {
			letters: groupedLetters,
			validRecords: validRecords.length,
			totalRecords: selectedRecords.length,
			validationErrors,
		};
	}, [selectedRecords]);

	// Inicializar cartas una sola vez
	useEffect(() => {
		if (preparedLetters.letters.length > 0 && letters.length === 0) {
			setLetters(preparedLetters.letters);
		}
	}, [preparedLetters.letters, letters.length]);

	// Estadísticas
	const stats = useMemo(() => {
		const saludCount = letters.filter((l) => l.templateType === "salud").length;
		const generalCount = letters.filter((l) => l.templateType === "general").length;
		const needReviewCount = letters.filter((l) => l.needsReview).length;
		const totalPolicies = letters.reduce((sum, l) => sum + l.policies.length, 0);

		return {
			totalLetters: letters.length,
			saludCount,
			generalCount,
			needReviewCount,
			totalPolicies,
		};
	}, [letters]);

	// Actualizar datos de una carta
	const updateLetterData = (letterId: string, updates: Partial<LetterData>) => {
		setLetters((prev) => {
			const updated = prev.map((letter) => {
				if (letter.id === letterId) {
					const updatedLetter = { ...letter, ...updates };
					// Recalcular needsReview y missingData después de actualizar
					updatedLetter.needsReview = calculateNeedsReview(updatedLetter);
					updatedLetter.missingData = calculateMissingData(updatedLetter);
					return updatedLetter;
				}
				return letter;
			});
			return updated;
		});
	};

	// Función para calcular si necesita revisión
	const calculateNeedsReview = (letter: LetterData): boolean => {
		return letter.policies.some((policy) => {
			if (letter.templateType === "salud") {
				return !policy.manualFields?.renewalPremium || policy.manualFields.renewalPremium <= 0;
			}
			if (letter.templateType === "general") {
				return (
					!policy.manualFields?.deductibles ||
					!policy.manualFields?.territoriality ||
					!policy.manualFields?.specificConditions
				);
			}
			return false;
		});
	};

	// Función para calcular datos faltantes dinámicamente
	const calculateMissingData = (letter: LetterData): string[] => {
		const missing: string[] = [];

		letter.policies.forEach((policy, index) => {
			const policyLabel = `Póliza ${index + 1} (${policy.policyNumber})`;

			if (letter.templateType === "salud") {
				if (!policy.manualFields?.renewalPremium || policy.manualFields.renewalPremium <= 0) {
					missing.push(`${policyLabel}: Prima de renovación anual`);
				}
			}

			if (letter.templateType === "general") {
				if (!policy.manualFields?.deductibles) {
					missing.push(`${policyLabel}: Información de deducibles`);
				}
				if (!policy.manualFields?.territoriality) {
					missing.push(`${policyLabel}: Información de extraterritorialidad`);
				}
				if (!policy.manualFields?.specificConditions) {
					missing.push(`${policyLabel}: Condiciones específicas`);
				}
			}
		});

		return missing;
	};

	// Generar PDF para una carta específica
	const generateSinglePDF = async (letterData: LetterData): Promise<Blob> => {
		const TemplateComponent = letterData.templateType === "salud" ? HealthTemplate : GeneralTemplate;
		const pdfBlob = await pdf(<TemplateComponent letterData={letterData} />).toBlob();
		return pdfBlob;
	};

	// Preview de una carta
	const handlePreview = async (letterId: string) => {
		setPreviewLetter(letterId);
		const letter = letters.find((l) => l.id === letterId);
		if (letter) {
			try {
				const pdfBlob = await generateSinglePDF(letter);
				const pdfUrl = URL.createObjectURL(pdfBlob);
				window.open(pdfUrl, "_blank");
			} catch (error) {
				console.error("Error generating preview:", error);
				alert("Error al generar la vista previa");
			}
		}
		setPreviewLetter(null);
	};

	// Descargar carta individual
	const handleDownloadSingle = async (letterId: string) => {
		const letter = letters.find((l) => l.id === letterId);
		if (!letter) return;

		try {
			setIsGenerating(true);
			const pdfBlob = await generateSinglePDF(letter);
			const fileName = generateFileName(letter.client.name, letter.templateType);

			const url = URL.createObjectURL(pdfBlob);
			const link = document.createElement("a");
			link.href = url;
			link.download = fileName;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Error generating PDF:", error);
			alert("Error al generar el PDF");
		} finally {
			setIsGenerating(false);
		}
	};

	// Generar y descargar todas las cartas como ZIP
	const handleDownloadAll = async () => {
		try {
			setIsGenerating(true);
			const zip = new JSZip();
			const generatedLetters: GeneratedLetter[] = [];
			const errors: string[] = [];

			for (const letter of letters) {
				try {
					const pdfBlob = await generateSinglePDF(letter);
					const fileName = generateFileName(letter.client.name, letter.templateType);

					zip.file(fileName, pdfBlob);

					generatedLetters.push({
						letterId: letter.id,
						clientName: letter.client.name,
						templateType: letter.templateType,
						fileName,
						pdfBlob,
						policyCount: letter.policies.length,
						needsReview: letter.needsReview,
						missingData: letter.missingData,
					});
				} catch (error) {
					const errorMsg = `Error generando carta para ${letter.client.name}: ${error}`;
					errors.push(errorMsg);
					console.error(errorMsg);
				}
			}

			const zipBlob = await zip.generateAsync({ type: "blob" });
			const zipFileName = `Cartas_Vencimiento_${new Date().toISOString().slice(0, 10)}.zip`;

			const url = URL.createObjectURL(zipBlob);
			const link = document.createElement("a");
			link.href = url;
			link.download = zipFileName;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);

			const result: PDFGenerationResult = {
				success: generatedLetters.length > 0,
				letters: generatedLetters,
				errors,
				totalGenerated: generatedLetters.length,
			};

			setGenerationResult(result);
			onGenerated?.(result);
		} catch (error) {
			console.error("Error generating ZIP:", error);
			alert("Error al generar el archivo ZIP");
		} finally {
			setIsGenerating(false);
		}
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold text-gray-900 flex items-center">
						<FileText className="h-6 w-6 mr-2 text-patria-blue" />
						Generador de Cartas
					</h2>
					<p className="text-gray-600">
						{stats.totalLetters} cartas para {stats.totalPolicies} pólizas
					</p>
				</div>

				<div className="flex items-center space-x-3">
					<Button
						onClick={handleDownloadAll}
						disabled={isGenerating || letters.length === 0}
						className="patria-btn-primary"
					>
						{isGenerating ? (
							<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
						) : (
							<Package className="h-4 w-4 mr-2" />
						)}
						Descargar Todo (ZIP)
					</Button>
					<Button variant="outline" onClick={onClose}>
						<X className="h-4 w-4 mr-2" />
						Cerrar
					</Button>
				</div>
			</div>

			{/* Estadísticas */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<Card>
					<CardContent className="p-4 text-center">
						<div className="text-2xl font-bold text-patria-blue">{stats.totalLetters}</div>
						<div className="text-sm text-gray-600">Total Cartas</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="p-4 text-center">
						<div className="text-2xl font-bold text-patria-green">{stats.saludCount}</div>
						<div className="text-sm text-gray-600">Salud</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="p-4 text-center">
						<div className="text-2xl font-bold text-blue-600">{stats.generalCount}</div>
						<div className="text-sm text-gray-600">General</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="p-4 text-center">
						<div className="text-2xl font-bold text-red-600">{stats.needReviewCount}</div>
						<div className="text-sm text-gray-600">Revisar</div>
					</CardContent>
				</Card>
			</div>

			{/* Errores de validación */}
			{preparedLetters.validationErrors.length > 0 && (
				<Alert className="border-yellow-200 bg-yellow-50">
					<AlertTriangle className="h-4 w-4 text-yellow-600" />
					<AlertDescription className="text-yellow-800">
						<div className="font-medium mb-2">
							{preparedLetters.validationErrors.length} registros omitidos por datos faltantes:
						</div>
						<ul className="text-sm space-y-1 list-disc list-inside max-h-32 overflow-y-auto">
							{preparedLetters.validationErrors.slice(0, 5).map((error, index) => (
								<li key={index}>{error}</li>
							))}
							{preparedLetters.validationErrors.length > 5 && (
								<li>... y {preparedLetters.validationErrors.length - 5} más</li>
							)}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			{/* Lista de cartas */}
			<div className="space-y-4">
				{letters.map((letter) => (
					<LetterCard
						key={letter.id}
						letter={letter}
						isEditing={editingLetter === letter.id}
						isPreviewing={previewLetter === letter.id}
						isGenerating={isGenerating}
						onEdit={() => setEditingLetter(letter.id)}
						onSaveEdit={(updates) => {
							updateLetterData(letter.id, updates);
							setEditingLetter(null);
						}}
						onCancelEdit={() => setEditingLetter(null)}
						onPreview={() => handlePreview(letter.id)}
						onDownload={() => handleDownloadSingle(letter.id)}
						onUpdateLetterData={updateLetterData}
					/>
				))}
			</div>

			{/* Resultado de generación */}
			{generationResult && (
				<Card className="border-green-200 bg-green-50">
					<CardContent className="p-4">
						<div className="flex items-center">
							<CheckCircle className="h-5 w-5 text-green-600 mr-2" />
							<div>
								<div className="font-medium text-green-800">
									✅ {generationResult.totalGenerated} cartas generadas exitosamente
								</div>
								{generationResult.errors.length > 0 && (
									<div className="text-sm text-red-600 mt-1">
										{generationResult.errors.length} errores encontrados
									</div>
								)}
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

// Componente para cada carta individual
interface LetterCardProps {
	letter: LetterData;
	isEditing: boolean;
	isPreviewing: boolean;
	isGenerating: boolean;
	onEdit: () => void;
	onSaveEdit: (updates: Partial<LetterData>) => void;
	onCancelEdit: () => void;
	onPreview: () => void;
	onDownload: () => void;
	onUpdateLetterData: (letterId: string, updates: Partial<LetterData>) => void;
}

function LetterCard({
	letter,
	isEditing,
	isPreviewing,
	isGenerating,
	onEdit,
	onSaveEdit,
	onCancelEdit,
	onPreview,
	onDownload,
	onUpdateLetterData,
}: LetterCardProps) {
	// Estado local sincronizado con props
	const [editedLetter, setEditedLetter] = useState<LetterData>(letter);

	// Sincronizar estado local con props cuando cambie la carta
	useEffect(() => {
		setEditedLetter(letter);
	}, [letter]);

	const handleSave = () => {
		onSaveEdit(editedLetter);
	};

	// Función para actualizar póliza individual con tipado correcto
	const updatePolicy = (policyIndex: number, field: string, value: any) => {
		const updatedLetter = {
			...editedLetter,
			policies: editedLetter.policies.map((policy, index) =>
				index === policyIndex
					? {
							...policy,
							manualFields: {
								...policy.manualFields,
								[field]: value,
							},
					  }
					: policy
			),
		};

		setEditedLetter(updatedLetter);

		// Actualizar inmediatamente en el estado padre para feedback visual
		onUpdateLetterData(letter.id, updatedLetter);
	};

	const getTemplateIcon = (type: "salud" | "general") => {
		return type === "salud" ? "🏥" : "🚗";
	};

	const getTemplateColor = (type: "salud" | "general") => {
		return type === "salud" ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50";
	};

	return (
		<Card
			className={`${getTemplateColor(letter.templateType)} ${
				letter.needsReview ? "border-l-4 border-l-red-500" : "border-l-4 border-l-green-500"
			}`}
		>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex items-center space-x-3">
						<div className="text-2xl">{getTemplateIcon(letter.templateType)}</div>
						<div>
							<CardTitle className="text-lg">{letter.client.name}</CardTitle>
							<CardDescription>
								{letter.policies.length} póliza{letter.policies.length > 1 ? "s" : ""} • Template{" "}
								{letter.templateType} • Ref: {letter.referenceNumber}
							</CardDescription>
						</div>
					</div>

					<div className="flex items-center space-x-2">
						{letter.needsReview && (
							<Badge variant="destructive" className="text-xs">
								<AlertTriangle className="h-3 w-3 mr-1" />
								Revisar
							</Badge>
						)}

						{!letter.needsReview && (
							<Badge variant="default" className="text-xs bg-green-600">
								<CheckCircle className="h-3 w-3 mr-1" />
								Completo
							</Badge>
						)}

						<Badge variant={letter.templateType === "salud" ? "default" : "secondary"} className="text-xs">
							{letter.templateType.toUpperCase()}
						</Badge>

						<div className="flex space-x-1">
							{!isEditing ? (
								<>
									<Button size="sm" variant="outline" onClick={onEdit} disabled={isGenerating}>
										<Edit3 className="h-4 w-4" />
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={onPreview}
										disabled={isGenerating || isPreviewing}
									>
										{isPreviewing ? (
											<RefreshCw className="h-4 w-4 animate-spin" />
										) : (
											<Eye className="h-4 w-4" />
										)}
									</Button>
									<Button
										size="sm"
										onClick={onDownload}
										disabled={isGenerating}
										className="patria-btn-primary"
									>
										<Download className="h-4 w-4" />
									</Button>
								</>
							) : (
								<>
									<Button size="sm" onClick={handleSave} className="patria-btn-primary">
										<Save className="h-4 w-4" />
									</Button>
									<Button size="sm" variant="outline" onClick={onCancelEdit}>
										<X className="h-4 w-4" />
									</Button>
								</>
							)}
						</div>
					</div>
				</div>
			</CardHeader>

			<CardContent>
				{/* Información del cliente */}
				<div className="mb-4 p-3 bg-white rounded border">
					<h4 className="font-medium text-gray-900 mb-2">Información del Cliente</h4>
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<span className="text-gray-600">Teléfono:</span> {letter.client.phone || "No especificado"}
						</div>
						<div>
							<span className="text-gray-600">Email:</span> {letter.client.email || "No especificado"}
						</div>
					</div>
				</div>

				{/* Lista de pólizas */}
				<div className="space-y-3">
					<h4 className="font-medium text-gray-900">Pólizas ({letter.policies.length})</h4>

					{editedLetter.policies.map((policy, index) => (
						<div key={index} className="p-3 bg-white rounded border">
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
								<div>
									<div className="font-medium text-gray-900">{policy.company}</div>
									<div className="text-gray-600">Póliza: {policy.policyNumber}</div>
									<div className="text-gray-600">Vence: {policy.expiryDate}</div>
								</div>

								<div>
									<div className="text-gray-600">Ramo: {policy.branch}</div>
									<div className="text-gray-600">
										Valor:{" "}
										{policy.insuredValue ? formatUSD(policy.insuredValue) : "No especificado"}
									</div>
									<div className="text-gray-600">
										Prima: {policy.premium ? formatCurrency(policy.premium) : "No especificado"}
									</div>
								</div>

								{/* Campos editables mejorados */}
								<div className="space-y-2">
									{isEditing && (
										<>
											{letter.templateType === "salud" && (
												<NumericInput
													label="Prima renovación (USD):"
													value={policy.manualFields?.renewalPremium || 0}
													onChange={(value) => updatePolicy(index, "renewalPremium", value)}
													placeholder="0.00"
													className="text-xs h-8"
												/>
											)}

											{letter.templateType === "general" && (
												<>
													<div>
														<label className="text-xs text-gray-600 block mb-1">
															Deducibles:
														</label>
														<Input
															placeholder="10% mínimo Bs 1.000"
															value={policy.manualFields?.deductibles || ""}
															onChange={(e) =>
																updatePolicy(index, "deductibles", e.target.value)
															}
															className="text-xs h-8"
														/>
													</div>

													<div>
														<label className="text-xs text-gray-600 block mb-1">
															Extraterritorialidad:
														</label>
														<Input
															placeholder="Bs 400 (contado) / Bs 500 (posterior)"
															value={policy.manualFields?.territoriality || ""}
															onChange={(e) =>
																updatePolicy(index, "territoriality", e.target.value)
															}
															className="text-xs h-8"
														/>
													</div>

													<ConditionsTextarea
														label="Condiciones específicas:"
														value={policy.manualFields?.specificConditions || ""}
														onChange={(value) =>
															updatePolicy(index, "specificConditions", value)
														}
														placeholder="Describa condiciones adicionales, coberturas especiales, etc."
													/>
												</>
											)}
										</>
									)}

									{/* Mostrar datos guardados con mejor formato */}
									{!isEditing && policy.manualFields && (
										<div className="text-xs space-y-1">
											{letter.templateType === "salud" && policy.manualFields.renewalPremium && (
												<div className="text-green-700 font-medium">
													✓ Prima: {formatUSD(policy.manualFields.renewalPremium)}
												</div>
											)}
											{letter.templateType === "general" && (
												<>
													{policy.manualFields.deductibles && (
														<div className="text-green-700 font-medium">
															✓ Deducibles: {policy.manualFields.deductibles}
														</div>
													)}
													{policy.manualFields.territoriality && (
														<div className="text-green-700 font-medium">
															✓ Extraterritorialidad: {policy.manualFields.territoriality}
														</div>
													)}
													{policy.manualFields.specificConditions && (
														<div className="text-green-700 font-medium">
															✓ Condiciones: {policy.manualFields.specificConditions}
														</div>
													)}
												</>
											)}
										</div>
									)}
								</div>
							</div>

							{/* Materia asegurada */}
							{policy.insuredMatter && (
								<div className="mt-2 pt-2 border-t border-gray-200">
									<div className="text-xs text-gray-600">
										<span className="font-medium">Materia asegurada:</span> {policy.insuredMatter}
									</div>
								</div>
							)}
						</div>
					))}
				</div>

				{/* Datos faltantes actualizados dinámicamente */}
				{letter.missingData.length > 0 && (
					<div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
						<div className="flex items-center mb-2">
							<AlertTriangle className="h-4 w-4 text-red-600 mr-2" />
							<span className="font-medium text-red-800">Datos faltantes a completar:</span>
						</div>
						<ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
							{letter.missingData.slice(0, 5).map((item, index) => (
								<li key={index}>{item}</li>
							))}
							{letter.missingData.length > 5 && <li>... y {letter.missingData.length - 5} más</li>}
						</ul>
					</div>
				)}

				{/* Mensaje cuando todos los datos están completos */}
				{!letter.needsReview && (
					<div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
						<div className="flex items-center">
							<CheckCircle className="h-4 w-4 text-green-600 mr-2" />
							<span className="font-medium text-green-800">
								Todos los datos están completos. Lista para generar.
							</span>
						</div>
					</div>
				)}

				{/* Ejecutivo responsable */}
				<div className="mt-4 pt-3 border-t border-gray-200 text-sm text-gray-600">
					<span className="font-medium">Ejecutivo:</span> {letter.executive}
				</div>
			</CardContent>
		</Card>
	);
}
