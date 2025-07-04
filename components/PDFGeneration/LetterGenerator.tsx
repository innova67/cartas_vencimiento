// components/PDFGeneration/LetterGenerator.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { FileText, Download, Eye, AlertTriangle, CheckCircle, X, Edit3, Save, RefreshCw, Package, Printer, Mail, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProcessedInsuranceRecord } from "@/types/insurance";
import { LetterData, GeneratedLetter, PDFGenerationResult, PolicyForLetter } from "@/types/pdf";
import { groupRecordsForLetters, validateRecordForPDF, generateFileName, formatUSD, formatCurrency, determineTemplateType } from "@/utils/pdfutils";
import { cleanPhoneNumber, createWhatsAppMessage } from "@/utils/whatsapp"; // Importar utilidades de WhatsApp
import { pdf } from "@react-pdf/renderer";
import { HealthTemplate } from "./HealthTemplate";
import { GeneralTemplate } from "./GeneralTemplate";
import JSZip from "jszip";

// Icono de WhatsApp como componente SVG
const WhatsAppIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
	</svg>
);

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
		const numericValue = input.replace(/[^0-9.]/g, "");
		const parts = numericValue.split(".");
		const cleanValue = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : numericValue;

		setDisplayValue(cleanValue);
		const numValue = parseFloat(cleanValue);
		if (!isNaN(numValue) && numValue >= 0) {
			onChange(numValue);
		} else if (cleanValue === "" || cleanValue === ".") {
			onChange(0);
		}
	};

	const handleBlur = () => {
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
			<Input type="text" value={displayValue} onChange={handleChange} onBlur={handleBlur} placeholder={placeholder} className={className} />
		</div>
	);
}

// Nuevo componente para input numérico con selección de moneda
interface NumericInputWithCurrencyProps {
	value: number | undefined;
	currency: "Bs." | "$us.";
	onValueChange: (value: number) => void;
	onCurrencyChange: (currency: "Bs." | "$us.") => void;
	label?: string;
	placeholder?: string;
	className?: string;
}

function NumericInputWithCurrency({ value, currency, onValueChange, onCurrencyChange, label, placeholder, className }: NumericInputWithCurrencyProps) {
	const [displayValue, setDisplayValue] = useState(value !== undefined && value !== null ? String(value) : "");

	useEffect(() => {
		setDisplayValue(value !== undefined && value !== null ? String(value) : "");
	}, [value]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const input = e.target.value;
		const numericValue = input.replace(/[^0-9.]/g, "");
		const parts = numericValue.split(".");
		const cleanValue = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : numericValue;

		setDisplayValue(cleanValue);
		const numValue = parseFloat(cleanValue);
		if (!isNaN(numValue) && numValue >= 0) {
			onValueChange(numValue);
		} else if (cleanValue === "" || cleanValue === ".") {
			onValueChange(0);
		}
	};

	const handleBlur = () => {
		const numValue = parseFloat(displayValue);
		if (!isNaN(numValue)) {
			setDisplayValue(numValue.toString());
		} else {
			setDisplayValue("");
			onValueChange(0);
		}
	};

	return (
		<div>
			{label && <label className="text-xs text-gray-600 block mb-1">{label}</label>}
			<div className="flex items-center space-x-2">
				<Input type="text" value={displayValue} onChange={handleChange} onBlur={handleBlur} placeholder={placeholder} className={className} />
				<Select value={currency} onValueChange={(val: "Bs." | "$us.") => onCurrencyChange(val)}>
					<SelectTrigger className="w-20 h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="Bs.">Bs.</SelectItem>
						<SelectItem value="$us.">$us.</SelectItem>
					</SelectContent>
				</Select>
			</div>
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

	useEffect(() => {
		if (preparedLetters.letters.length > 0 && letters.length === 0) {
			setLetters(preparedLetters.letters);
		}
	}, [preparedLetters.letters, letters.length]);

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

	const updateLetterData = (letterId: string, updates: Partial<LetterData>) => {
		setLetters((prev) => {
			const updated = prev.map((letter) => {
				if (letter.id === letterId) {
					const updatedLetter = { ...letter, ...updates };
					updatedLetter.needsReview = calculateNeedsReview(updatedLetter);
					updatedLetter.missingData = calculateMissingData(updatedLetter);
					return updatedLetter;
				}
				return letter;
			});
			return updated;
		});
	};

	const calculateNeedsReview = (letter: LetterData): boolean => {
		return (
			letter.policies.some((policy) => {
				if (policy.manualFields?.insuredValue === undefined || policy.manualFields?.insuredValue === null || policy.manualFields.insuredValue <= 0) {
					return true;
				}
				if (!policy.manualFields?.premium || policy.manualFields.premium <= 0) {
					return true;
				}

				if (letter.templateType === "salud") {
					return !policy.manualFields?.renewalPremium || policy.manualFields.renewalPremium <= 0;
				}
				if (letter.templateType === "general") {
					return (
						!policy.manualFields?.insuredMatter ||
						!policy.manualFields?.specificConditions ||
						!policy.manualFields?.deductibles ||
						policy.manualFields.deductibles <= 0 ||
						!policy.manualFields?.territoriality ||
						policy.manualFields.territoriality <= 0
					);
				}
				return false;
			}) || letter.missingData.length > 0
		);
	};

	const calculateMissingData = (letter: LetterData): string[] => {
		const missing: string[] = [];

		letter.policies.forEach((policy, index) => {
			const policyLabel = `Póliza ${index + 1} (${policy.policyNumber})`;

			if (policy.manualFields?.insuredValue === undefined || policy.manualFields?.insuredValue === null || policy.manualFields.insuredValue <= 0) {
				missing.push(`${policyLabel}: Valor Asegurado`);
			}

			if (!policy.manualFields?.premium || policy.manualFields.premium <= 0) {
				missing.push(`${policyLabel}: Prima`);
			}

			if (letter.templateType === "salud") {
				if (!policy.manualFields?.renewalPremium || policy.manualFields.renewalPremium <= 0) {
					missing.push(`${policyLabel}: Prima de renovación anual`);
				}
			}

			if (letter.templateType === "general") {
				if (!policy.manualFields?.insuredMatter) {
					missing.push(`${policyLabel}: Materia Asegurada`);
				}
				if (!policy.manualFields?.deductibles || policy.manualFields.deductibles <= 0) {
					missing.push(`${policyLabel}: Información de deducibles`);
				}
				if (!policy.manualFields?.territoriality || policy.manualFields.territoriality <= 0) {
					missing.push(`${policyLabel}: Información de extraterritorialidad`);
				}
				if (!policy.manualFields?.specificConditions) {
					missing.push(`${policyLabel}: Condiciones específicas`);
				}
			}
		});

		return missing;
	};

	const generateSinglePDF = async (letterData: LetterData): Promise<Blob> => {
		const TemplateComponent = letterData.templateType === "salud" ? HealthTemplate : GeneralTemplate;
		const pdfBlob = await pdf(<TemplateComponent letterData={letterData} />).toBlob();
		return pdfBlob;
	};

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

	const downloadBlob = (blob: Blob, fileName: string) => {
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = fileName;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const handleDownloadSingle = async (letterId: string) => {
		const letter = letters.find((l) => l.id === letterId);
		if (!letter) return;

		try {
			setIsGenerating(true);
			const pdfBlob = await generateSinglePDF(letter);
			const fileName = generateFileName(letter.client.name, letter.templateType);
			downloadBlob(pdfBlob, fileName);

			const result: PDFGenerationResult = {
				success: true,
				letters: [
					{
						letterId: letter.id,
						sourceRecordIds: letter.sourceRecordIds,
						clientName: letter.client.name,
						clientPhone: letter.client.phone,
						clientEmail: letter.client.email,
						templateType: letter.templateType,
						fileName,
						pdfBlob,
						policyCount: letter.policies.length,
						needsReview: letter.needsReview,
						missingData: letter.missingData,
					},
				],
				errors: [],
				totalGenerated: 1,
			};
			setGenerationResult(result);
			onGenerated?.(result);
		} catch (error) {
			console.error("Error generating PDF:", error);
			alert("Error al generar el PDF");
		} finally {
			setIsGenerating(false);
		}
	};

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
						sourceRecordIds: letter.sourceRecordIds,
						clientName: letter.client.name,
						clientPhone: letter.client.phone,
						clientEmail: letter.client.email,
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

			downloadBlob(zipBlob, zipFileName);

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

	const handleSendWhatsApp = async (letterId: string) => {
		const letter = letters.find((l) => l.id === letterId);
		if (!letter || !letter.client.phone) return;

		try {
			setIsGenerating(true);
			// 1. Generate and download the PDF
			const pdfBlob = await generateSinglePDF(letter);
			const fileName = generateFileName(letter.client.name, letter.templateType);
			downloadBlob(pdfBlob, fileName);

			// 2. Prepare WhatsApp link
			const cleanedPhone = cleanPhoneNumber(letter.client.phone);
			const message = createWhatsAppMessage(letter);
			const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanedPhone}&text=${message}`;

			// 3. Open WhatsApp in a new tab
			window.open(whatsappUrl, "_blank", "noopener,noreferrer");

			// 4. Trigger the onGenerated callback to update the main dashboard
			const result: PDFGenerationResult = {
				success: true,
				letters: [
					{
						letterId: letter.id,
						sourceRecordIds: letter.sourceRecordIds,
						clientName: letter.client.name,
						clientPhone: letter.client.phone,
						clientEmail: letter.client.email,
						templateType: letter.templateType,
						fileName,
						pdfBlob,
						policyCount: letter.policies.length,
						needsReview: letter.needsReview,
						missingData: letter.missingData,
					},
				],
				errors: [],
				totalGenerated: 1,
			};
			setGenerationResult(result);
			onGenerated?.(result);
		} catch (error) {
			console.error("Error preparing WhatsApp message:", error);
			alert("Error al preparar el mensaje de WhatsApp.");
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
					<Button onClick={handleDownloadAll} disabled={isGenerating || letters.length === 0} className="patria-btn-primary">
						{isGenerating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Package className="h-4 w-4 mr-2" />}
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

			{/* Validation errors */}
			{preparedLetters.validationErrors.length > 0 && (
				<Alert className="border-yellow-200 bg-yellow-50">
					<AlertTriangle className="h-4 w-4 text-yellow-600" />
					<AlertDescription className="text-yellow-800">
						<div className="font-medium mb-2">{preparedLetters.validationErrors.length} registros omitidos por datos faltantes:</div>
						<ul className="text-sm space-y-1 list-disc list-inside max-h-32 overflow-y-auto">
							{preparedLetters.validationErrors.slice(0, 5).map((error, index) => (
								<li key={index}>{error}</li>
							))}
							{preparedLetters.validationErrors.length > 5 && <li>... y {preparedLetters.validationErrors.length - 5} más</li>}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			{/* List of letters */}
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
						onWhatsApp={() => handleSendWhatsApp(letter.id)}
						onUpdateLetterData={updateLetterData}
					/>
				))}
			</div>

			{/* Generation result */}
			{generationResult && (
				<Card className="border-green-200 bg-green-50">
					<CardContent className="p-4">
						<div className="flex items-center">
							<CheckCircle className="h-5 w-5 text-green-600 mr-2" />
							<div>
								<div className="font-medium text-green-800">✅ {generationResult.totalGenerated} cartas generadas exitosamente</div>
								{generationResult.errors.length > 0 && <div className="text-sm text-red-600 mt-1">{generationResult.errors.length} errores encontrados</div>}
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

// Component for each individual letter
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
	onWhatsApp: () => void;
	onUpdateLetterData: (letterId: string, updates: Partial<LetterData>) => void;
}

function LetterCard({ letter, isEditing, isPreviewing, isGenerating, onEdit, onSaveEdit, onCancelEdit, onPreview, onDownload, onWhatsApp, onUpdateLetterData }: LetterCardProps) {
	const [editedLetter, setEditedLetter] = useState<LetterData>(letter);

	useEffect(() => {
		setEditedLetter(letter);
	}, [letter]);

	const handleSave = () => {
		onSaveEdit(editedLetter);
	};

	const handleClientInfoChange = (field: "phone" | "email", value: string) => {
		const updatedLetterData = {
			...editedLetter,
			client: {
				...editedLetter.client,
				[field]: value,
			},
		};
		setEditedLetter(updatedLetterData);
		onUpdateLetterData(letter.id, updatedLetterData);
	};

	const updatePolicy = (policyIndex: number, field: keyof NonNullable<PolicyForLetter["manualFields"]>, value: any) => {
		const updatedPolicies = editedLetter.policies.map((policy, index) => {
			if (index === policyIndex) {
				const updatedManualFields = {
					...policy.manualFields,
					[field]: value,
				};
				return {
					...policy,
					manualFields: updatedManualFields,
				};
			}
			return policy;
		});

		const updatedLetterData = {
			...editedLetter,
			policies: updatedPolicies,
		};

		setEditedLetter(updatedLetterData);
		onUpdateLetterData(letter.id, updatedLetterData);
	};

	const getTemplateIcon = (type: "salud" | "general") => {
		return type === "salud" ? "🏥" : "🚗";
	};

	const getTemplateColor = (type: "salud" | "general") => {
		return type === "salud" ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50";
	};

	const formatMonetaryValue = (value: number | undefined, currency: "Bs." | "$us." | undefined) => {
		if (value === undefined || value === null || isNaN(value)) {
			return "No especificado";
		}
		let formattedValue: string;
		const numberFormatter = new Intl.NumberFormat("es-BO", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});
		formattedValue = numberFormatter.format(value);
		if (currency === "Bs.") {
			return `Bs. ${formattedValue}`;
		} else if (currency === "$us.") {
			return `$us. ${formattedValue}`;
		}
		return value.toString();
	};

	return (
		<Card className={`${getTemplateColor(letter.templateType)} ${letter.needsReview ? "border-l-4 border-l-red-500" : "border-l-4 border-l-green-500"}`}>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex items-center space-x-3">
						<div className="text-2xl">{getTemplateIcon(letter.templateType)}</div>
						<div>
							<CardTitle className="text-lg">{letter.client.name}</CardTitle>
							<CardDescription>
								{letter.policies.length} póliza{letter.policies.length > 1 ? "s" : ""} • Template {letter.templateType} • Ref: {letter.referenceNumber}
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
									<Button size="default" variant="outline" onClick={onEdit} disabled={isGenerating}>
										<Edit3 className="h-4 w-4" />
									</Button>
									<Button size="default" variant="outline" onClick={onPreview} disabled={isGenerating || isPreviewing}>
										{isPreviewing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
									</Button>
									<Button size="default" onClick={onDownload} disabled={isGenerating} className="patria-btn-primary">
										<Download className="h-4 w-4" />
									</Button>
									<Button size="default" onClick={onWhatsApp} disabled={isGenerating || !letter.client.phone} className="bg-green-500 hover:bg-green-600 text-white">
										<WhatsAppIcon />
									</Button>
								</>
							) : (
								<>
									<Button size="default" onClick={handleSave} className="patria-btn-primary">
										<Save className="h-4 w-4" />
									</Button>
									<Button size="default" variant="outline" onClick={onCancelEdit}>
										<X className="h-4 w-4" />
									</Button>
								</>
							)}
						</div>
					</div>
				</div>
			</CardHeader>

			<CardContent>
				<div className="mb-4 p-3 bg-white rounded border">
					<h4 className="font-medium text-gray-900 mb-2">Información del Cliente</h4>
					{isEditing ? (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
							<div>
								<label className="text-xs text-gray-600 block mb-1 flex items-center">
									<Phone className="h-3 w-3 mr-1" />
									Teléfono
								</label>
								<Input value={editedLetter.client.phone || ""} onChange={(e) => handleClientInfoChange("phone", e.target.value)} placeholder="No especificado" className="text-sm h-8" />
							</div>
							<div>
								<label className="text-xs text-gray-600 block mb-1 flex items-center">
									<Mail className="h-3 w-3 mr-1" />
									Email
								</label>
								<Input value={editedLetter.client.email || ""} onChange={(e) => handleClientInfoChange("email", e.target.value)} placeholder="No especificado" className="text-sm h-8" />
							</div>
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
							<div>
								<span className="text-gray-600">Teléfono:</span> {letter.client.phone || "No especificado"}
							</div>
							<div>
								<span className="text-gray-600">Email:</span> {letter.client.email || "No especificado"}
							</div>
						</div>
					)}
				</div>

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
									<div className="text-gray-600">Valor Original: {policy.manualFields?.originalInsuredValue ? formatUSD(policy.manualFields.originalInsuredValue) : "No especificado"}</div>
									<div className="text-gray-600">Prima Original: {policy.manualFields?.originalPremium ? formatCurrency(policy.manualFields.originalPremium) : "No especificado"}</div>
									<div className="text-gray-600 mt-1">
										Materia Asegurada Original: <span className="italic">{policy.manualFields?.originalInsuredMatter || "No especificado"}</span>
									</div>
								</div>

								<div className="space-y-2">
									{isEditing && (
										<>
											<NumericInput
												label="Valor Asegurado (editable):"
												value={policy.manualFields?.insuredValue || 0}
												onChange={(value) => updatePolicy(index, "insuredValue", value)}
												placeholder="0.00"
												className="text-xs h-8"
											/>

											<NumericInput
												label="Prima (editable):"
												value={policy.manualFields?.premium || 0}
												onChange={(value) => updatePolicy(index, "premium", value)}
												placeholder="0.00"
												className="text-xs h-8"
											/>

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
													<ConditionsTextarea
														label="Materia Asegurada (editable):"
														value={policy.manualFields?.insuredMatter || ""}
														onChange={(value) => updatePolicy(index, "insuredMatter", value)}
														placeholder="Describa la materia asegurada..."
													/>

													<NumericInputWithCurrency
														label="Deducibles:"
														value={policy.manualFields?.deductibles}
														currency={policy.manualFields?.deductiblesCurrency || "Bs."}
														onValueChange={(value) => updatePolicy(index, "deductibles", value)}
														onCurrencyChange={(currency) => updatePolicy(index, "deductiblesCurrency", currency)}
														placeholder="0.00"
														className="text-xs h-8"
													/>

													<NumericInputWithCurrency
														label="Extraterritorialidad:"
														value={policy.manualFields?.territoriality}
														currency={policy.manualFields?.territorialityCurrency || "Bs."}
														onValueChange={(value) => updatePolicy(index, "territoriality", value)}
														onCurrencyChange={(currency) => updatePolicy(index, "territorialityCurrency", currency)}
														placeholder="0.00"
														className="text-xs h-8"
													/>

													<ConditionsTextarea
														label="Condiciones específicas:"
														value={policy.manualFields?.specificConditions || ""}
														onChange={(value) => updatePolicy(index, "specificConditions", value)}
														placeholder="Describa condiciones adicionales, coberturas especiales, etc."
													/>
												</>
											)}
										</>
									)}

									{!isEditing && policy.manualFields && (
										<div className="text-xs space-y-1">
											{policy.manualFields.insuredValue !== undefined && policy.manualFields.insuredValue !== null && (
												<div className="text-green-700 font-medium">✓ Valor Asegurado (editable): {formatUSD(policy.manualFields.insuredValue)}</div>
											)}
											{policy.manualFields.premium !== undefined && policy.manualFields.premium !== null && (
												<div className="text-green-700 font-medium">✓ Prima (editable): {formatCurrency(policy.manualFields.premium)}</div>
											)}

											{letter.templateType === "salud" && policy.manualFields.renewalPremium !== undefined && policy.manualFields.renewalPremium !== null && (
												<div className="text-green-700 font-medium">✓ Prima renovación: {formatUSD(policy.manualFields.renewalPremium)}</div>
											)}
											{letter.templateType === "general" && (
												<>
													{policy.manualFields.insuredMatter && <div className="text-green-700 font-medium">✓ Materia Asegurada: {policy.manualFields.insuredMatter}</div>}
													{policy.manualFields.deductibles !== undefined && policy.manualFields.deductibles !== null && (
														<div className="text-green-700 font-medium">✓ Deducibles: {formatMonetaryValue(policy.manualFields.deductibles, policy.manualFields.deductiblesCurrency)}</div>
													)}
													{policy.manualFields.territoriality !== undefined && policy.manualFields.territoriality !== null && (
														<div className="text-green-700 font-medium">
															✓ Extraterritorialidad: {formatMonetaryValue(policy.manualFields.territoriality, policy.manualFields.territorialityCurrency)}
														</div>
													)}
													{policy.manualFields.specificConditions && <div className="text-green-700 font-medium">✓ Condiciones: {policy.manualFields.specificConditions}</div>}
												</>
											)}
										</div>
									)}
								</div>
							</div>
						</div>
					))}
				</div>

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

				{!letter.needsReview && (
					<div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
						<div className="flex items-center">
							<CheckCircle className="h-4 w-4 text-green-600 mr-2" />
							<span className="font-medium text-green-800">Todos los datos están completos. Lista para generar.</span>
						</div>
					</div>
				)}

				<div className="mt-4 pt-3 border-t border-gray-200 text-sm text-gray-600">
					<span className="font-medium">Ejecutivo:</span> {letter.executive}
				</div>
			</CardContent>
		</Card>
	);
}
