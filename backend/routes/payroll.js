const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');

router.get('/', async (req, res) => {
    const { month } = req.query; // YYYY-MM
    if (!month) return res.status(400).json({ error: 'Month required' });

    try {
        const employees = await dbService.getAllEmployees();
        const attendance = await dbService.getAllAttendance();
        const advances = await dbService.getAllAdvances();
        const debitNotes = await dbService.getAllDebitNotes();
        const payments = await dbService.getAllPayments();

        const settingsData = await dbService.getSettings();
        const stdHours = parseFloat(settingsData.standardHours || 8.5);
        const slabBase = parseFloat(settingsData.slabHours || 6);

        const payroll = employees.map(emp => {
            const isSupervisor = emp.employee_type === 'fixed_salary';
            const fixedMonthlySalary = parseFloat(emp.salary) || 0;

            const empAtt = attendance.filter(a =>
                String(a.employeeId) === String(emp.id) && a.date.startsWith(month)
            );

            const empAdv = advances.filter(a => {
                if (String(a.employeeId) !== String(emp.id)) return false;
                const deduct = a.deductionMonth || (a.date ? a.date.substring(0, 7) : '');
                return deduct === month;
            });

            const empDebit = debitNotes.filter(d => {
                if (String(d.employeeId) !== String(emp.id)) return false;
                const deduct = d.deductionMonth || (d.date ? d.date.substring(0, 7) : '');
                return deduct === month;
            });

            const empPay = payments.filter(p => String(p.employeeId) === String(emp.id) && p.salaryMonth === month);
            const totalPaid = empPay.reduce((sum, p) => sum + p.amount, 0);

            empPay.sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastPaymentDate = empPay.length > 0 ? empPay[0].date : null;
            const paymentProofs = empPay.filter(p => p.screenshot).map(p => p.screenshot);

            let totalSalary = 0;
            let totalFare = 0;
            let daysWorked = 0;

            if (isSupervisor) {
                // Fixed salary supervisor: always earns fixed monthly salary regardless of attendance
                totalSalary = fixedMonthlySalary;
                totalFare = parseFloat(emp.monthly_fare) || 0; // Monthly fare added to payroll
                daysWorked = null; // N/A for supervisors
            } else {
                daysWorked = empAtt.length;
                empAtt.forEach(att => {
                    let dailySalary = 0;
                    const workedHours = parseFloat(att.workedHours || att.totalHours || att.worked_hours || att.hours || 0);
                    if (isNaN(workedHours)) return;

                    const salary = parseFloat(emp.salary);
                    const normalRate = salary / stdHours;

                    if (att.sundayMode) {
                        dailySalary = salary;
                    } else if (att.slabMode) {
                        if (workedHours > stdHours) {
                            const extraHours = workedHours - stdHours;
                            const slabRate = salary / slabBase;
                            dailySalary = (normalRate * stdHours) + (slabRate * extraHours);
                        } else {
                            dailySalary = normalRate * workedHours;
                        }
                    } else {
                        dailySalary = normalRate * workedHours;
                    }

                    totalSalary += dailySalary;
                    totalFare += (parseFloat(att.fare) || 0);
                });
            }

            const totalAdvance = empAdv.reduce((sum, adv) => sum + (parseFloat(adv.amount) || 0), 0);
            const totalDebitNotes = empDebit.reduce((sum, deb) => sum + (parseFloat(deb.amount) || 0), 0);

            // --- Previous Balance Calculation ---
            let previousBalance = 0;

            if (isSupervisor) {
                // For supervisors: count past months they were active (based on payment history, advances, or debit notes)
                const pastPayMonths = new Set(
                    payments
                        .filter(p => String(p.employeeId) === String(emp.id) && p.salaryMonth < month)
                        .map(p => p.salaryMonth)
                );
                // Include months where advances were deducted
                advances
                    .filter(a => {
                        if (String(a.employeeId) !== String(emp.id)) return false;
                        const deduct = a.deductionMonth || (a.date ? a.date.substring(0, 7) : '');
                        return deduct < month;
                    })
                    .forEach(a => {
                        const deduct = a.deductionMonth || (a.date ? a.date.substring(0, 7) : '');
                        pastPayMonths.add(deduct);
                    });
                // Include months where debit notes were deducted
                debitNotes
                    .filter(d => {
                        if (String(d.employeeId) !== String(emp.id)) return false;
                        const deduct = d.deductionMonth || (d.date ? d.date.substring(0, 7) : '');
                        return deduct < month;
                    })
                    .forEach(d => {
                        const deduct = d.deductionMonth || (d.date ? d.date.substring(0, 7) : '');
                        pastPayMonths.add(deduct);
                    });

                const pastMonthsCount = pastPayMonths.size;
                const monthlyTotal = fixedMonthlySalary + (parseFloat(emp.monthly_fare) || 0);
                const pastEarningsSupervisor = monthlyTotal * pastMonthsCount;

                const pastAdvSupervisor = advances
                    .filter(a => {
                        if (String(a.employeeId) !== String(emp.id)) return false;
                        const deduct = a.deductionMonth || (a.date ? a.date.substring(0, 7) : '');
                        return deduct < month;
                    })
                    .reduce((sum, adv) => sum + (parseFloat(adv.amount) || 0), 0);

                const pastDebitSupervisor = debitNotes
                    .filter(d => {
                        if (String(d.employeeId) !== String(emp.id)) return false;
                        const deduct = d.deductionMonth || (d.date ? d.date.substring(0, 7) : '');
                        return deduct < month;
                    })
                    .reduce((sum, deb) => sum + (parseFloat(deb.amount) || 0), 0);

                const pastPaymentsSupervisor = payments
                    .filter(p => String(p.employeeId) === String(emp.id) && p.salaryMonth < month)
                    .reduce((sum, p) => sum + p.amount, 0);

                previousBalance = Math.round(pastEarningsSupervisor - pastAdvSupervisor - pastDebitSupervisor - pastPaymentsSupervisor);
            } else {
                const pastAtt = attendance.filter(a => String(a.employeeId) === String(emp.id) && a.date < `${month}-01`);
                let pastEarnings = 0;
                pastAtt.forEach(att => {
                    let dailySalary = 0;
                    const workedHours = parseFloat(att.workedHours || att.totalHours || att.worked_hours || att.hours || 0);
                    if (isNaN(workedHours)) return;

                    const salary = parseFloat(emp.salary);
                    const normalRate = salary / stdHours;

                    if (att.sundayMode) {
                        dailySalary = salary;
                    } else if (att.slabMode) {
                        if (workedHours > stdHours) {
                            const extraHours = workedHours - stdHours;
                            const slabRate = salary / slabBase;
                            dailySalary = (normalRate * stdHours) + (slabRate * extraHours);
                        } else {
                            dailySalary = normalRate * workedHours;
                        }
                    } else {
                        dailySalary = normalRate * workedHours;
                    }
                    pastEarnings += dailySalary;
                    pastEarnings += (parseFloat(att.fare) || 0);
                });

                const pastAdv = advances.filter(a => {
                    if (String(a.employeeId) !== String(emp.id)) return false;
                    const deduct = a.deductionMonth || (a.date ? a.date.substring(0, 7) : '');
                    return deduct < month;
                });
                const pastAdvDeductions = pastAdv.reduce((sum, adv) => sum + (parseFloat(adv.amount) || 0), 0);

                const pastDeb = debitNotes.filter(d => {
                    if (String(d.employeeId) !== String(emp.id)) return false;
                    const deduct = d.deductionMonth || (d.date ? d.date.substring(0, 7) : '');
                    return deduct < month;
                });
                const pastDebDeductions = pastDeb.reduce((sum, deb) => sum + (parseFloat(deb.amount) || 0), 0);

                const pastPay = payments.filter(p => String(p.employeeId) === String(emp.id) && p.salaryMonth < month);
                const pastPaymentsTotal = pastPay.reduce((sum, p) => sum + p.amount, 0);

                previousBalance = Math.round(pastEarnings - pastAdvDeductions - pastDebDeductions - pastPaymentsTotal);
            }

            const currentMonthNet = totalSalary + totalFare - totalAdvance - totalDebitNotes;
            const netPayable = Math.round(currentMonthNet + previousBalance);
            const remainingDue = netPayable - totalPaid;

            return {
                employee: emp,
                isSupervisor,
                daysWorked,
                salaryEarned: Math.round(totalSalary),
                fareTotal: totalFare,
                advancePaid: totalAdvance,
                debitNotesDeducted: totalDebitNotes,
                previousBalance: previousBalance,
                currentMonthNet: Math.round(currentMonthNet),
                finalPayable: netPayable,
                paidTotal: totalPaid,
                remainingDue: remainingDue,
                lastPaymentDate,
                paymentProofs,
                status: remainingDue <= 0 ? 'Settled' : (totalPaid > 0 ? 'Partial' : 'Unpaid')
            };
        });

        res.json(payroll);
    } catch (e) {
        console.error('Payroll Error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
